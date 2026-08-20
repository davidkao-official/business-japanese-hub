/**
 * Internal transactional-email worker. The public Edge Function has JWT
 * verification disabled because pg_cron calls it; the scheduled-job secret is
 * therefore the sole request credential. Receipt facts are claimed from one
 * server-authoritative database RPC and are never accepted in the request.
 */
import type { DbClient } from '../_shared/db.ts';
import {
  buildOrderConfirmationEmail,
  isOrderEmailConfigured,
  type EmailSendResult,
  type EmailSender,
  type OrderConfirmationFacts,
} from '../_shared/email.ts';
import type { Env } from '../_shared/env.ts';
import {
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';

export const ORDER_EMAIL_CLAIM_LIMIT = 20;
export const ORDER_EMAIL_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ORDER_EMAIL_SEND_CUTOFF_MARGIN_MS = 60 * 1000;

export interface ClaimedOrderEmailJob extends OrderConfirmationFacts {
  jobId: string;
  templateKey: string;
  createdAt: string;
  attemptCount: number;
}

export interface OrderEmailHandlerDeps {
  env: Env;
  db: DbClient;
  sender: EmailSender;
  log: Logger;
  now?: () => Date;
}

interface RunCounts {
  processed: number;
  sent: number;
  retry: number;
  dead: number;
}

export async function handleOrderEmail(
  req: HandlerRequest,
  deps: OrderEmailHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const suppliedSecret = headerValue(req.headers, 'x-scheduled-job-secret');
  if (!deps.env.scheduledJobSecret || suppliedSecret !== deps.env.scheduledJobSecret) {
    deps.log.warn({}, 'order-email rejected: invalid scheduled-job secret');
    return unauthorized('invalid scheduled job secret');
  }
  if (!isOrderEmailConfigured(deps.env)) {
    deps.log.error({}, 'order-email disabled: incomplete provider configuration');
    return jsonResult(503, { error: 'transactional email is not configured' });
  }

  const clock = deps.now ?? (() => new Date());
  const claimTime = clock();
  const { data, error } = await deps.db.rpc('claim_order_email_jobs', {
    p_limit: ORDER_EMAIL_CLAIM_LIMIT,
    p_now: claimTime.toISOString(),
  });
  if (error) {
    deps.log.error({ errorCode: 'claim_failed' }, 'order-email claim failed');
    return jsonResult(500, { error: 'email job claim failed' });
  }
  const jobs = (Array.isArray(data) ? data : []) as ClaimedOrderEmailJob[];
  const counts: RunCounts = { processed: 0, sent: 0, retry: 0, dead: 0 };

  for (const job of jobs) {
    counts.processed += 1;
    const outcome = await processJob(job, deps, clock());
    if (!outcome.ok) return jsonResult(500, { error: 'email job transition failed' });
    counts[outcome.state] += 1;
  }

  deps.log.info({ ...counts }, 'order-email run');
  return jsonResult(200, counts);
}

async function processJob(
  job: ClaimedOrderEmailJob,
  deps: OrderEmailHandlerDeps,
  now: Date,
): Promise<{ ok: true; state: 'sent' | 'retry' | 'dead' } | { ok: false }> {
  const deadline = new Date(job.createdAt).getTime() + ORDER_EMAIL_IDEMPOTENCY_WINDOW_MS;
  if (!Number.isFinite(deadline) || now.getTime() >= deadline) {
    return transition(deps, job, 'dead', {
      last_error_code: 'idempotency_window_expired',
      next_attempt_at: null,
    });
  }
  if (now.getTime() >= deadline - ORDER_EMAIL_SEND_CUTOFF_MARGIN_MS) {
    return transition(deps, job, 'dead', {
      last_error_code: 'idempotency_window_closing',
      next_attempt_at: null,
    });
  }

  let result: EmailSendResult;
  try {
    const message = buildOrderConfirmationEmail(job, deps.env);
    result = await deps.sender.send(message);
  } catch {
    result = { ok: false, errorCode: 'render_error', retryable: false };
  }

  if (result.ok) {
    return transition(deps, job, 'sent', {
      provider_message_id: result.providerMessageId,
      sent_at: now.toISOString(),
      last_error_code: null,
      next_attempt_at: null,
    });
  }

  const errorCode = normalizeErrorCode(result.errorCode);
  const delayMinutes = Math.min(60, 2 ** Math.max(0, job.attemptCount - 1));
  const nextAttempt = new Date(now.getTime() + delayMinutes * 60 * 1000);
  if (!result.retryable || nextAttempt.getTime() >= deadline) {
    return transition(deps, job, 'dead', {
      last_error_code: errorCode,
      next_attempt_at: null,
    });
  }
  return transition(deps, job, 'retry', {
    last_error_code: errorCode,
    next_attempt_at: nextAttempt.toISOString(),
  });
}

async function transition(
  deps: OrderEmailHandlerDeps,
  job: ClaimedOrderEmailJob,
  state: 'sent' | 'retry' | 'dead',
  fields: Record<string, unknown>,
): Promise<{ ok: true; state: typeof state } | { ok: false }> {
  const { error } = await deps.db
    .from('order_email_outbox')
    .update({ status: state, locked_at: null, ...fields })
    .eq('id', job.jobId)
    .eq('status', 'processing');
  if (error) {
    deps.log.error({ jobId: job.jobId, orderId: job.orderId, state, errorCode: 'transition_failed' }, 'order-email transition failed');
    return { ok: false };
  }
  const logFields = { jobId: job.jobId, orderId: job.orderId, state };
  if (state === 'dead') deps.log.warn(logFields, 'order-email requires manual handling');
  else deps.log.info(logFields, 'order-email transitioned');
  return { ok: true, state };
}

function normalizeErrorCode(value: string): string {
  return /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : 'provider_error';
}
