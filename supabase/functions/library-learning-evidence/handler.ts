import { authenticateBearer } from '../_shared/auth.ts';
import { validateLearningSkillIds } from '@business-japanese-hub/learning';
import type { DbClient } from '../_shared/db.ts';
import {
  badRequest,
  forbidden,
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';

export interface LibraryLearningChapter {
  chapterId: string;
  access: 'public' | 'entitled';
  skillIds: string[];
}

export interface LibraryLearningBook {
  bookId: string;
  releaseId: string;
  chapters: LibraryLearningChapter[];
}

export interface LibraryLearningCatalog {
  schemaVersion: 1;
  books: LibraryLearningBook[];
}

export interface LibraryLearningEvidenceHandlerDeps {
  db: DbClient;
  log: Logger;
  catalog: LibraryLearningCatalog;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && value.trim().length > 0;
}

function parseRequest(bodyText: string): { bookId: string; chapterId: string; eventId: string } | null {
  let input: unknown;
  try {
    input = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!isRecord(input)) return null;
  const keys = Object.keys(input).sort();
  if (keys.join(',') !== 'bookId,chapterId,eventId') return null;
  if (!isIdentifier(input.bookId) || !isIdentifier(input.chapterId)) return null;
  if (typeof input.eventId !== 'string' || !UUID.test(input.eventId)) return null;
  return { bookId: input.bookId, chapterId: input.chapterId, eventId: input.eventId };
}

function validCatalog(value: unknown): value is LibraryLearningCatalog {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.books)) return false;
  const bookIds = new Set<string>();
  for (const book of value.books) {
    if (
      !isRecord(book) ||
      !isIdentifier(book.bookId) ||
      typeof book.releaseId !== 'string' ||
      book.releaseId.length === 0 ||
      book.releaseId.length > 128 ||
      !Array.isArray(book.chapters) ||
      bookIds.has(book.bookId)
    ) {
      return false;
    }
    bookIds.add(book.bookId);
    const chapterIds = new Set<string>();
    for (const chapter of book.chapters) {
      const skills = isRecord(chapter) ? validateLearningSkillIds(chapter.skillIds) : null;
      if (
        !isRecord(chapter) ||
        !isIdentifier(chapter.chapterId) ||
        (chapter.access !== 'public' && chapter.access !== 'entitled') ||
        !skills?.ok ||
        chapterIds.has(chapter.chapterId)
      ) {
        return false;
      }
      chapterIds.add(chapter.chapterId);
    }
  }
  return true;
}

export async function handleLibraryLearningEvidence(
  req: HandlerRequest,
  deps: LibraryLearningEvidenceHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  const uid = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'));
  if (!uid) return unauthorized();
  const input = parseRequest(req.bodyText);
  if (!input) return badRequest('invalid request body');
  if (!validCatalog(deps.catalog)) return jsonResult(500, { error: 'invalid learning catalog' });

  const book = deps.catalog.books.find((candidate) => candidate.bookId === input.bookId);
  const chapter = book?.chapters.find((candidate) => candidate.chapterId === input.chapterId);
  if (!book || !chapter) return badRequest('unknown published content reference');
  if (chapter.access === 'entitled') {
    const entitlement = await deps.db
      .from('book_entitlement')
      .select('book_id')
      .eq('user_id', uid)
      .eq('book_id', book.bookId)
      .eq('status', 'active')
      .maybeSingle();
    if (entitlement.error) {
      deps.log.error({ error: entitlement.error.message }, 'Library entitlement lookup failed');
      return jsonResult(502, { error: 'entitlement lookup failed' });
    }
    if (!entitlement.data) return forbidden('active book entitlement required');
  }
  if (chapter.skillIds.length === 0) return jsonResult(200, { recorded: 0 });

  const { data, error } = await deps.db.rpc('record_library_learning_evidence', {
    p_user_id: uid,
    p_book_id: book.bookId,
    p_release_id: book.releaseId,
    p_chapter_id: chapter.chapterId,
    p_source_event_id: input.eventId,
    p_skill_ids: chapter.skillIds,
  });
  if (error) {
    deps.log.error({ error: error.message }, 'library learning evidence persistence failed');
    return jsonResult(502, { error: 'learning evidence persistence failed' });
  }
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0 || data > chapter.skillIds.length) {
    deps.log.error({}, 'library learning evidence returned an invalid count');
    return jsonResult(502, { error: 'learning evidence persistence failed' });
  }
  return jsonResult(200, { recorded: data });
}
