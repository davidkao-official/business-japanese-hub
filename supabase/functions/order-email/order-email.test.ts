import { describe, expect, it, vi } from 'vitest';
import type { EmailSender } from '../_shared/email.ts';
import {
  createMockDb,
  fakeLogger,
  handlerRequest,
  testEnv,
  type MockRoute,
} from '../_shared/testing.ts';
import { handleOrderEmail, type ClaimedOrderEmailJob } from './handler.ts';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const JOB: ClaimedOrderEmailJob = {
  jobId: 'job-1',
  orderId: 'ord-1',
  recipientEmail: 'reader@example.com',
  locale: 'en',
  templateKey: 'order-confirmation-v1',
  createdAt: '2026-08-20T11:55:00.000Z',
  attemptCount: 1,
  itemName: 'Business Meetings',
  amountMinor: 1200,
  currency: 'USD',
  paidAt: '2026-08-20T11:54:00.000Z',
  provider: 'paypal',
  paymentMethod: 'credit',
};

function request(secret = 'test-scheduled-secret', method = 'POST') {
  return handlerRequest(method, 'https://test.supabase.co/functions/v1/order-email', '', {
    'x-scheduled-job-secret': secret,
  });
}

function sender(result: Awaited<ReturnType<EmailSender['send']>>): EmailSender {
  return { send: vi.fn().mockResolvedValue(result) };
}

function workerDb(routes: Record<string, MockRoute> = {}) {
  return createMockDb({ 'rpc:prepare_order_email_send': { data: true }, ...routes });
}

describe('order-email scheduled worker', () => {
  it('rejects non-POST requests and incorrect scheduled secrets before claiming', async () => {
    const mock = workerDb();
    const emailSender = sender({ ok: true, providerMessageId: 'msg-1' });

    const wrongMethod = await handleOrderEmail(request('test-scheduled-secret', 'GET'), {
      env: testEnv(), db: mock.db, sender: emailSender, log: fakeLogger(), now: () => NOW,
    });
    const wrongSecret = await handleOrderEmail(request('wrong'), {
      env: testEnv(), db: mock.db, sender: emailSender, log: fakeLogger(), now: () => NOW,
    });

    expect(wrongMethod.status).toBe(405);
    expect(wrongSecret.status).toBe(401);
    expect(mock.rpcCalls('claim_order_email_jobs')).toHaveLength(0);
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('fails closed before claiming when transactional email is not configured', async () => {
    const mock = workerDb();
    const emailSender = sender({ ok: true, providerMessageId: 'msg-1' });
    const result = await handleOrderEmail(request(), {
      env: testEnv({ resendApiKey: undefined }),
      db: mock.db,
      sender: emailSender,
      log: fakeLogger(),
      now: () => NOW,
    });

    expect(result.status).toBe(503);
    expect(mock.rpcCalls('claim_order_email_jobs')).toHaveLength(0);
  });

  it('claims authoritative receipt facts, sends once, and marks the row sent', async () => {
    const mock = workerDb({ 'rpc:claim_order_email_jobs': { data: [JOB] } });
    const emailSender = sender({ ok: true, providerMessageId: 'msg-1' });
    const result = await handleOrderEmail(request(), {
      env: testEnv(), db: mock.db, sender: emailSender, log: fakeLogger(), now: () => NOW,
    });

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ processed: 1, sent: 1, retry: 0, dead: 0 });
    expect(mock.rpcCalls('claim_order_email_jobs')[0]?.args[0]).toMatchObject({
      p_limit: 20,
      p_now: NOW.toISOString(),
    });
    expect(mock.rpcCalls('prepare_order_email_send')[0]?.args[0]).toEqual({ p_job_id: 'job-1' });
    expect(emailSender.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'reader@example.com',
      idempotencyKey: 'order-confirmation/ord-1',
    }));
    const update = mock.callsFor('order_email_outbox', 'update')[0]?.args[0] as Record<string, unknown>;
    expect(update).toMatchObject({
      status: 'sent',
      provider_message_id: 'msg-1',
      sent_at: NOW.toISOString(),
      locked_at: null,
      last_error_code: null,
    });
  });

  it('suppresses a claimed confirmation when a refund wins the pre-send recheck', async () => {
    const mock = workerDb({
      'rpc:claim_order_email_jobs': { data: [JOB] },
      'rpc:prepare_order_email_send': { data: false },
    });
    const emailSender = sender({ ok: true, providerMessageId: 'msg-1' });
    const result = await handleOrderEmail(request(), {
      env: testEnv(), db: mock.db, sender: emailSender, log: fakeLogger(), now: () => NOW,
    });

    expect(JSON.parse(result.body)).toMatchObject({ processed: 1, sent: 0, dead: 1 });
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(mock.callsFor('order_email_outbox', 'update')).toHaveLength(0);
  });

  it('releases a retryable failure with a bounded backoff inside the 24-hour window', async () => {
    const mock = workerDb({ 'rpc:claim_order_email_jobs': { data: [{ ...JOB, attemptCount: 3 }] } });
    const emailSender = sender({ ok: false, errorCode: 'rate_limit_exceeded', retryable: true });
    const result = await handleOrderEmail(request(), {
      env: testEnv(), db: mock.db, sender: emailSender, log: fakeLogger(), now: () => NOW,
    });

    expect(JSON.parse(result.body)).toMatchObject({ processed: 1, sent: 0, retry: 1, dead: 0 });
    expect(mock.callsFor('order_email_outbox', 'update')[0]?.args[0]).toMatchObject({
      status: 'retry',
      last_error_code: 'rate_limit_exceeded',
      next_attempt_at: '2026-08-20T12:04:00.000Z',
      locked_at: null,
    });
  });

  it('marks non-retryable failures dead for manual handling', async () => {
    const mock = workerDb({ 'rpc:claim_order_email_jobs': { data: [JOB] } });
    const emailSender = sender({ ok: false, errorCode: 'validation_error', retryable: false });
    const result = await handleOrderEmail(request(), {
      env: testEnv(), db: mock.db, sender: emailSender, log: fakeLogger(), now: () => NOW,
    });

    expect(JSON.parse(result.body)).toMatchObject({ processed: 1, retry: 0, dead: 1 });
    expect(mock.callsFor('order_email_outbox', 'update')[0]?.args[0]).toMatchObject({
      status: 'dead',
      last_error_code: 'validation_error',
      locked_at: null,
    });
  });

  it('never sends a job at or beyond Resend’s 24-hour idempotency window', async () => {
    const expired = { ...JOB, createdAt: '2026-08-19T12:00:00.000Z' };
    const mock = workerDb({ 'rpc:claim_order_email_jobs': { data: [expired] } });
    const emailSender = sender({ ok: true, providerMessageId: 'msg-1' });
    const result = await handleOrderEmail(request(), {
      env: testEnv(), db: mock.db, sender: emailSender, log: fakeLogger(), now: () => NOW,
    });

    expect(JSON.parse(result.body)).toMatchObject({ processed: 1, sent: 0, retry: 0, dead: 1 });
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(mock.callsFor('order_email_outbox', 'update')[0]?.args[0]).toMatchObject({
      status: 'dead',
      last_error_code: 'idempotency_window_expired',
      locked_at: null,
    });
  });

  it('re-reads time for each claimed job so a queued job cannot age past the window', async () => {
    const first = { ...JOB, jobId: 'job-1', createdAt: '2026-08-19T13:00:00.000Z' };
    const expiring = { ...JOB, jobId: 'job-2', orderId: 'ord-2', createdAt: '2026-08-19T12:01:00.000Z' };
    const mock = workerDb({ 'rpc:claim_order_email_jobs': { data: [first, expiring] } });
    const emailSender = sender({ ok: true, providerMessageId: 'msg-1' });
    const clock = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date('2026-08-20T12:00:00.000Z'))
      .mockReturnValueOnce(new Date('2026-08-20T12:00:00.000Z'))
      .mockReturnValueOnce(new Date('2026-08-20T12:01:00.000Z'));

    const result = await handleOrderEmail(request(), {
      env: testEnv(), db: mock.db, sender: emailSender, log: fakeLogger(), now: clock,
    });

    expect(JSON.parse(result.body)).toMatchObject({ processed: 2, sent: 1, dead: 1 });
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(clock).toHaveBeenCalledTimes(3);
  });

  it('returns 500 if a claimed row cannot be durably transitioned', async () => {
    const mock = workerDb({
      'rpc:claim_order_email_jobs': { data: [JOB] },
      order_email_outbox: { error: 'database unavailable' },
    });
    const result = await handleOrderEmail(request(), {
      env: testEnv(),
      db: mock.db,
      sender: sender({ ok: true, providerMessageId: 'msg-1' }),
      log: fakeLogger(),
      now: () => NOW,
    });

    expect(result.status).toBe(500);
    expect(result.body).not.toContain('reader@example.com');
  });
});
