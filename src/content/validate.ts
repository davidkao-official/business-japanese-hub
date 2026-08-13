/**
 * Hand-written, zero-dependency runtime validation for the content model.
 *
 * No external runtime dependency (no zod, no io-ts, …): all checks are plain
 * TypeScript guards so the validator is deterministic and can run anywhere —
 * dev, build, publish, and reader startup.
 *
 * Determinism: for the same input the validator always emits the same ordered
 * list of `ContentIssue`s (document order, then cross-reference checks). Callers
 * should fail early in dev/build/publish rather than at reader runtime.
 */

import {
  BLOCK_TYPES,
  CALLOUT_KINDS,
  DIFFICULTY_LEVELS,
  HEADING_LEVELS,
  PRICE_TIERS,
  PUBLICATION_STATUSES,
  SCHEMA_VERSION,
} from './types';
import type { BlockType, Book, Chapter, ContentBlock } from './types';

/** A structured validation problem. */
export interface ContentIssue {
  /**
   * Dot/bracket path to the offending node, e.g. "chapters[0].blocks[2].text".
   * The root of a Book validation is "$".
   */
  path: string;
  code: IssueCode;
  /** Human-readable description; includes the field name and the actual value. */
  message: string;
}

export type IssueCode =
  | 'invalid_root'
  | 'schema_version_mismatch'
  | 'missing_field'
  | 'empty_string'
  | 'wrong_type'
  | 'invalid_enum'
  | 'invalid_number'
  | 'unknown_block_type'
  | 'missing_discriminator'
  | 'row_width_mismatch'
  | 'duplicate_id'
  | 'duplicate_slug'
  | 'reference_not_found'
  | 'missing_items';

/** Discriminated result: either the validated value or the list of issues. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ContentIssue[] };

/** Type guard: is `value` a supported block type string? */
export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------------- *
 * Context & helpers
 * ------------------------------------------------------------------------- */

interface ValidationContext {
  issues: ContentIssue[];
  /** Every id seen so far (book id, chapter ids, and block ids share one namespace). */
  ids: Set<string>;
  /** Ids of chapters that validated with a unique id, in document order. */
  chapterIds: string[];
  /** Non-empty chapter slugs seen so far, for duplicate detection. */
  chapterSlugs: Set<string>;
  /** Navigation `previous`/`next` refs collected while walking chapters. */
  navigationRefs: Array<{ path: string; chapterId: string }>;
  /** Table-of-contents chapter refs collected while walking the TOC. */
  tocRefs: Array<{ path: string; chapterId: string }>;
}

function createContext(): ValidationContext {
  return {
    issues: [],
    ids: new Set(),
    chapterIds: [],
    chapterSlugs: new Set(),
    navigationRefs: [],
    tocRefs: [],
  };
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function push(issues: ContentIssue[], path: string, code: IssueCode, message: string): void {
  issues.push({ path, code, message });
}

function finish<T>(ctx: ValidationContext, value: unknown): ValidationResult<T> {
  return ctx.issues.length === 0
    ? { ok: true, value: value as T }
    : { ok: false, issues: ctx.issues };
}

/* ------------------------------------------------------------------------- *
 * Primitive field readers
 * ------------------------------------------------------------------------- */

/**
 * Validates a required, globally-unique id. Returns true when a valid unique id
 * was recorded (so callers can, for example, collect a chapter's id).
 */
function checkId(record: Record<string, unknown>, path: string, ctx: ValidationContext): boolean {
  const idPath = `${path}.id`;
  const id = record['id'];
  if (id === undefined) {
    push(ctx.issues, idPath, 'missing_field', 'missing required field "id"');
    return false;
  }
  if (typeof id !== 'string') {
    push(ctx.issues, idPath, 'wrong_type', `field "id" expected string, got ${describeType(id)}`);
    return false;
  }
  if (id.length === 0) {
    push(ctx.issues, idPath, 'empty_string', 'field "id" must not be empty');
    return false;
  }
  if (ctx.ids.has(id)) {
    push(ctx.issues, idPath, 'duplicate_id', `duplicate id "${id}"; ids must be unique across the whole book`);
    return false;
  }
  ctx.ids.add(id);
  return true;
}

interface StringOpts {
  /** Reject the empty string. */
  nonEmpty?: boolean;
}

/** Reads a required string field; on failure records exactly one issue and returns null. */
function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
  opts: StringOpts = {},
): string | null {
  const value = record[key];
  if (value === undefined) {
    push(ctx.issues, path, 'missing_field', `missing required field "${key}"`);
    return null;
  }
  if (typeof value !== 'string') {
    push(ctx.issues, path, 'wrong_type', `field "${key}" expected string, got ${describeType(value)}`);
    return null;
  }
  if (opts.nonEmpty === true && value.length === 0) {
    push(ctx.issues, path, 'empty_string', `field "${key}" must not be empty`);
    return null;
  }
  return value;
}

/** Reads an optional string field; validates the type when present. */
function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    push(ctx.issues, path, 'wrong_type', `field "${key}" expected string, got ${describeType(value)}`);
    return undefined;
  }
  return value;
}

interface NumberOpts {
  /** Require a finite integer. */
  integer?: boolean;
  /** Reject values strictly below `min`. */
  min?: number;
}

/** Reads an optional number field; validates the type/constraints when present. */
function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
  opts: NumberOpts = {},
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    push(ctx.issues, path, 'wrong_type', `field "${key}" expected number, got ${describeType(value)}`);
    return undefined;
  }
  if (opts.integer === true && !Number.isInteger(value)) {
    push(ctx.issues, path, 'invalid_number', `field "${key}" expected an integer, got ${value}`);
    return undefined;
  }
  if (opts.min !== undefined && value < opts.min) {
    push(ctx.issues, path, 'invalid_number', `field "${key}" must be >= ${opts.min}, got ${value}`);
    return undefined;
  }
  return value;
}

/** Reads a required string enum field; validates membership when present. */
function readRequiredStringEnum(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  path: string,
  ctx: ValidationContext,
): string | null {
  const value = record[key];
  if (value === undefined) {
    push(ctx.issues, path, 'missing_field', `missing required field "${key}"`);
    return null;
  }
  if (typeof value !== 'string') {
    push(ctx.issues, path, 'wrong_type', `field "${key}" expected one of ${allowed.join(', ')}, got ${describeType(value)}`);
    return null;
  }
  if (!(allowed as readonly string[]).includes(value)) {
    push(ctx.issues, path, 'invalid_enum', `field "${key}" must be one of ${allowed.join(', ')}; got ${JSON.stringify(value)}`);
    return null;
  }
  return value;
}

interface ArrayOpts {
  /** Reject an empty array with `missing_items`. */
  nonEmpty?: boolean;
}

/** Reads a required array field; on failure records exactly one issue and returns null. */
function readRequiredArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
  opts: ArrayOpts = {},
): unknown[] | null {
  const value = record[key];
  if (value === undefined) {
    push(ctx.issues, path, 'missing_field', `missing required field "${key}"`);
    return null;
  }
  if (!Array.isArray(value)) {
    push(ctx.issues, path, 'wrong_type', `field "${key}" expected array, got ${describeType(value)}`);
    return null;
  }
  if (opts.nonEmpty === true && value.length === 0) {
    push(ctx.issues, path, 'missing_items', `field "${key}" must contain at least one item`);
    return null;
  }
  return value;
}

/** Validates that `value` is an array of strings (optionally non-empty items). */
function validateStringArray(
  value: unknown,
  path: string,
  ctx: ValidationContext,
  opts: StringOpts = {},
): void {
  if (!Array.isArray(value)) {
    push(ctx.issues, path, 'wrong_type', `expected array of strings, got ${describeType(value)}`);
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (typeof item !== 'string') {
      push(ctx.issues, itemPath, 'wrong_type', `expected string, got ${describeType(item)}`);
    } else if (opts.nonEmpty === true && item.length === 0) {
      push(ctx.issues, itemPath, 'empty_string', 'must not be empty');
    }
  });
}

/* ------------------------------------------------------------------------- *
 * Content blocks
 * ------------------------------------------------------------------------- */

function validateBlock(value: unknown, path: string, ctx: ValidationContext): void {
  if (!isRecord(value)) {
    push(ctx.issues, path, 'wrong_type', `expected content block object, got ${describeType(value)}`);
    return;
  }
  validateBlockRecord(value, path, ctx);
}

function validateBlockRecord(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  checkId(record, path, ctx);

  const typePath = `${path}.type`;
  const type = record['type'];
  if (type === undefined) {
    push(ctx.issues, typePath, 'missing_discriminator', 'content block is missing the required "type" discriminator');
    return;
  }
  if (typeof type !== 'string') {
    push(ctx.issues, typePath, 'wrong_type', `"type" discriminator expected string, got ${describeType(type)}`);
    return;
  }
  if (!isBlockType(type)) {
    push(ctx.issues, typePath, 'unknown_block_type', `unknown content block type ${JSON.stringify(type)}`);
    return;
  }

  switch (type) {
    case 'paragraph':
      readRequiredString(record, 'text', `${path}.text`, ctx, { nonEmpty: true });
      break;
    case 'heading':
      readRequiredString(record, 'text', `${path}.text`, ctx, { nonEmpty: true });
      readHeadingLevel(record, path, ctx);
      break;
    case 'image':
      readRequiredString(record, 'src', `${path}.src`, ctx, { nonEmpty: true });
      readRequiredString(record, 'alt', `${path}.alt`, ctx, { nonEmpty: true });
      readOptionalString(record, 'caption', `${path}.caption`, ctx);
      readOptionalString(record, 'credit', `${path}.credit`, ctx);
      readOptionalNumber(record, 'width', `${path}.width`, ctx, { integer: true, min: 1 });
      readOptionalNumber(record, 'height', `${path}.height`, ctx, { integer: true, min: 1 });
      break;
    case 'quote':
      readRequiredString(record, 'text', `${path}.text`, ctx, { nonEmpty: true });
      readOptionalString(record, 'attribution', `${path}.attribution`, ctx);
      break;
    case 'callout':
      readRequiredStringEnum(record, 'kind', CALLOUT_KINDS, `${path}.kind`, ctx);
      readOptionalString(record, 'title', `${path}.title`, ctx);
      readRequiredString(record, 'text', `${path}.text`, ctx, { nonEmpty: true });
      break;
    case 'table':
      validateTable(record, path, ctx);
      break;
    case 'vocabulary':
      readRequiredString(record, 'term', `${path}.term`, ctx, { nonEmpty: true });
      readOptionalString(record, 'reading', `${path}.reading`, ctx);
      readRequiredString(record, 'meaning', `${path}.meaning`, ctx, { nonEmpty: true });
      readOptionalString(record, 'partOfSpeech', `${path}.partOfSpeech`, ctx);
      readOptionalString(record, 'example', `${path}.example`, ctx);
      break;
    case 'dialogue':
      readOptionalString(record, 'context', `${path}.context`, ctx);
      validateDialogueLines(record, path, ctx);
      break;
    case 'example':
      readRequiredString(record, 'text', `${path}.text`, ctx, { nonEmpty: true });
      readOptionalString(record, 'translation', `${path}.translation`, ctx);
      readOptionalString(record, 'note', `${path}.note`, ctx);
      break;
    case 'comparison':
      readOptionalString(record, 'title', `${path}.title`, ctx);
      validateComparisonRows(record, path, ctx);
      break;
    case 'caseStudy':
      readOptionalString(record, 'title', `${path}.title`, ctx);
      readRequiredString(record, 'scenario', `${path}.scenario`, ctx, { nonEmpty: true });
      readOptionalArrayOfStrings(record, 'questions', `${path}.questions`, ctx);
      readOptionalString(record, 'outcome', `${path}.outcome`, ctx);
      break;
    case 'doDont':
      readOptionalString(record, 'title', `${path}.title`, ctx);
      readRequiredArrayOfStrings(record, 'do', `${path}.do`, ctx);
      readRequiredArrayOfStrings(record, 'dont', `${path}.dont`, ctx);
      break;
    case 'exercise':
      readRequiredString(record, 'question', `${path}.question`, ctx, { nonEmpty: true });
      readOptionalString(record, 'hint', `${path}.hint`, ctx);
      readOptionalArrayOfStrings(record, 'options', `${path}.options`, ctx);
      readOptionalString(record, 'answer', `${path}.answer`, ctx);
      readOptionalString(record, 'explanation', `${path}.explanation`, ctx);
      break;
    case 'authorNote':
      readOptionalString(record, 'author', `${path}.author`, ctx);
      readOptionalString(record, 'title', `${path}.title`, ctx);
      readRequiredString(record, 'text', `${path}.text`, ctx, { nonEmpty: true });
      break;
  }
}

function readHeadingLevel(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  const level = record['level'];
  if (level === undefined) return;
  if (typeof level !== 'number' || !Number.isInteger(level)) {
    push(ctx.issues, `${path}.level`, 'wrong_type', `field "level" expected a number, got ${describeType(level)}`);
    return;
  }
  if (!(HEADING_LEVELS as readonly number[]).includes(level)) {
    push(ctx.issues, `${path}.level`, 'invalid_enum', `field "level" must be one of ${HEADING_LEVELS.join(', ')}; got ${level}`);
  }
}

/** Reads an optional string-array field; validates each item when present. */
function readOptionalArrayOfStrings(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
): void {
  const value = record[key];
  if (value === undefined) return;
  validateStringArray(value, path, ctx, { nonEmpty: true });
}

/** Reads a required string-array field; validates each item when present. */
function readRequiredArrayOfStrings(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
): void {
  const value = record[key];
  if (value === undefined) {
    push(ctx.issues, path, 'missing_field', `missing required field "${key}"`);
    return;
  }
  validateStringArray(value, path, ctx, { nonEmpty: true });
}

function validateTable(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  readOptionalString(record, 'caption', `${path}.caption`, ctx);
  const columns = readRequiredArray(record, 'columns', `${path}.columns`, ctx, { nonEmpty: true });
  if (columns !== null) {
    validateStringArray(columns, `${path}.columns`, ctx, { nonEmpty: true });
  }
  const rows = readRequiredArray(record, 'rows', `${path}.rows`, ctx, { nonEmpty: true });
  if (rows === null) return;

  // Only enforce row width when we actually know the column count.
  const columnCount = columns !== null ? columns.length : -1;
  rows.forEach((row, index) => {
    const rowPath = `${path}.rows[${index}]`;
    if (!Array.isArray(row)) {
      push(ctx.issues, rowPath, 'wrong_type', `expected array of cells, got ${describeType(row)}`);
      return;
    }
    if (columnCount >= 0 && row.length !== columnCount) {
      push(
        ctx.issues,
        rowPath,
        'row_width_mismatch',
        `row has ${row.length} cells but the table declares ${columnCount} columns`,
      );
    }
    row.forEach((cell, cellIndex) => {
      if (typeof cell !== 'string') {
        push(ctx.issues, `${rowPath}[${cellIndex}]`, 'wrong_type', `expected string cell, got ${describeType(cell)}`);
      }
    });
  });
}

function validateDialogueLines(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  const lines = readRequiredArray(record, 'lines', `${path}.lines`, ctx, { nonEmpty: true });
  if (lines === null) return;
  lines.forEach((line, index) => {
    const linePath = `${path}.lines[${index}]`;
    if (!isRecord(line)) {
      push(ctx.issues, linePath, 'wrong_type', `expected dialogue line object, got ${describeType(line)}`);
      return;
    }
    readRequiredString(line, 'speaker', `${linePath}.speaker`, ctx, { nonEmpty: true });
    readRequiredString(line, 'text', `${linePath}.text`, ctx, { nonEmpty: true });
    readOptionalString(line, 'note', `${linePath}.note`, ctx);
  });
}

function validateComparisonRows(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  const rows = readRequiredArray(record, 'rows', `${path}.rows`, ctx, { nonEmpty: true });
  if (rows === null) return;
  rows.forEach((row, index) => {
    const rowPath = `${path}.rows[${index}]`;
    if (!isRecord(row)) {
      push(ctx.issues, rowPath, 'wrong_type', `expected comparison row object, got ${describeType(row)}`);
      return;
    }
    readRequiredString(row, 'label', `${rowPath}.label`, ctx, { nonEmpty: true });
    readRequiredArrayOfStrings(row, 'points', `${rowPath}.points`, ctx);
  });
}

/* ------------------------------------------------------------------------- *
 * Chapter
 * ------------------------------------------------------------------------- */

function checkChapter(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  if (checkId(record, path, ctx)) {
    const id = record['id'];
    if (typeof id === 'string') ctx.chapterIds.push(id);
  }

  const slug = readRequiredString(record, 'slug', `${path}.slug`, ctx, { nonEmpty: true });
  if (slug !== null) {
    if (ctx.chapterSlugs.has(slug)) {
      push(ctx.issues, `${path}.slug`, 'duplicate_slug', `duplicate chapter slug "${slug}"`);
    } else {
      ctx.chapterSlugs.add(slug);
    }
  }

  readRequiredString(record, 'title', `${path}.title`, ctx, { nonEmpty: true });
  readOptionalString(record, 'subtitle', `${path}.subtitle`, ctx);
  readOptionalString(record, 'summary', `${path}.summary`, ctx);

  const order = record['order'];
  if (order === undefined) {
    push(ctx.issues, `${path}.order`, 'missing_field', 'missing required field "order"');
  } else if (typeof order !== 'number' || Number.isNaN(order)) {
    push(ctx.issues, `${path}.order`, 'wrong_type', `field "order" expected number, got ${describeType(order)}`);
  } else if (!Number.isInteger(order) || order < 1) {
    push(ctx.issues, `${path}.order`, 'invalid_number', 'field "order" expected an integer >= 1');
  }

  const blocks = record['blocks'];
  if (blocks === undefined) {
    push(ctx.issues, `${path}.blocks`, 'missing_field', 'missing required field "blocks"');
  } else if (!Array.isArray(blocks)) {
    push(ctx.issues, `${path}.blocks`, 'wrong_type', `field "blocks" expected array, got ${describeType(blocks)}`);
  } else if (blocks.length === 0) {
    push(ctx.issues, `${path}.blocks`, 'missing_items', 'field "blocks" must contain at least one content block');
  } else {
    blocks.forEach((block, index) => validateBlock(block, `${path}.blocks[${index}]`, ctx));
  }

  const navigation = record['navigation'];
  if (navigation !== undefined) {
    if (!isRecord(navigation)) {
      push(ctx.issues, `${path}.navigation`, 'wrong_type', `field "navigation" expected object, got ${describeType(navigation)}`);
    } else {
      const previous = navigation['previous'];
      if (previous !== undefined) {
        if (typeof previous !== 'string') {
          push(ctx.issues, `${path}.navigation.previous`, 'wrong_type', `field "navigation.previous" expected a chapter id string, got ${describeType(previous)}`);
        } else {
          ctx.navigationRefs.push({ path: `${path}.navigation.previous`, chapterId: previous });
        }
      }
      const next = navigation['next'];
      if (next !== undefined) {
        if (typeof next !== 'string') {
          push(ctx.issues, `${path}.navigation.next`, 'wrong_type', `field "navigation.next" expected a chapter id string, got ${describeType(next)}`);
        } else {
          ctx.navigationRefs.push({ path: `${path}.navigation.next`, chapterId: next });
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Book metadata
 * ------------------------------------------------------------------------- */

/** Validates an optional object field by delegating to `check`. */
function checkOptionalObject(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
  check: (value: Record<string, unknown>, path: string, ctx: ValidationContext) => void,
): void {
  const value = record[key];
  if (value === undefined) return;
  if (!isRecord(value)) {
    push(ctx.issues, path, 'wrong_type', `field "${key}" expected object, got ${describeType(value)}`);
    return;
  }
  check(value, path, ctx);
}

function checkAuthors(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  // `path` already includes `.authors` (callers pass `'$.authors'`), so do not re-append it.
  const authors = readRequiredArray(record, 'authors', path, ctx, { nonEmpty: true });
  if (authors === null) return;
  authors.forEach((author, index) => {
    const authorPath = `${path}[${index}]`;
    if (!isRecord(author)) {
      push(ctx.issues, authorPath, 'wrong_type', `expected author object, got ${describeType(author)}`);
      return;
    }
    readOptionalString(author, 'id', `${authorPath}.id`, ctx);
    readRequiredString(author, 'name', `${authorPath}.name`, ctx, { nonEmpty: true });
    readOptionalString(author, 'role', `${authorPath}.role`, ctx);
    readOptionalString(author, 'bio', `${authorPath}.bio`, ctx);
    readOptionalString(author, 'website', `${authorPath}.website`, ctx);
  });
}

function checkCover(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  readRequiredString(record, 'src', `${path}.src`, ctx, { nonEmpty: true });
  readRequiredString(record, 'alt', `${path}.alt`, ctx, { nonEmpty: true });
  readOptionalString(record, 'caption', `${path}.caption`, ctx);
  readOptionalString(record, 'credit', `${path}.credit`, ctx);
  readOptionalNumber(record, 'width', `${path}.width`, ctx, { integer: true, min: 1 });
  readOptionalNumber(record, 'height', `${path}.height`, ctx, { integer: true, min: 1 });
}

function checkEdition(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  const number = record['number'];
  if (number === undefined) {
    push(ctx.issues, `${path}.number`, 'missing_field', 'missing required field "number"');
  } else if (typeof number !== 'number' || Number.isNaN(number)) {
    push(ctx.issues, `${path}.number`, 'wrong_type', `field "number" expected number, got ${describeType(number)}`);
  } else if (!Number.isInteger(number) || number < 1) {
    push(ctx.issues, `${path}.number`, 'invalid_number', 'field "number" expected an integer >= 1');
  }
  readOptionalString(record, 'label', `${path}.label`, ctx);
  readOptionalNumber(record, 'year', `${path}.year`, ctx, { integer: true });
}

function checkPublication(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  readRequiredStringEnum(record, 'status', PUBLICATION_STATUSES, `${path}.status`, ctx);
  readOptionalString(record, 'releasedAt', `${path}.releasedAt`, ctx);
}

function checkPrice(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  readRequiredStringEnum(record, 'tier', PRICE_TIERS, `${path}.tier`, ctx);
  readOptionalNumber(record, 'amount', `${path}.amount`, ctx, { min: 0 });
  readOptionalString(record, 'currency', `${path}.currency`, ctx);
}

function checkAudience(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  readOptionalArrayOfStrings(record, 'levels', `${path}.levels`, ctx);
  readOptionalArrayOfStrings(record, 'languages', `${path}.languages`, ctx);
  readOptionalString(record, 'description', `${path}.description`, ctx);
}

function checkDifficulty(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  const level = record['level'];
  if (level === undefined) {
    push(ctx.issues, `${path}.level`, 'missing_field', 'missing required field "level"');
  } else if (typeof level !== 'number' || !Number.isInteger(level)) {
    push(ctx.issues, `${path}.level`, 'wrong_type', `field "level" expected a number, got ${describeType(level)}`);
  } else if (!(DIFFICULTY_LEVELS as readonly number[]).includes(level)) {
    push(ctx.issues, `${path}.level`, 'invalid_enum', `field "level" must be an integer between ${DIFFICULTY_LEVELS[0]} and ${DIFFICULTY_LEVELS[DIFFICULTY_LEVELS.length - 1]}; got ${level}`);
  }
  readOptionalString(record, 'label', `${path}.label`, ctx);
  readOptionalString(record, 'description', `${path}.description`, ctx);
}

function checkTableOfContents(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  const entries = readRequiredArray(record, 'entries', `${path}.entries`, ctx, { nonEmpty: true });
  if (entries === null) return;
  entries.forEach((entry, index) => {
    const entryPath = `${path}.entries[${index}]`;
    if (!isRecord(entry)) {
      push(ctx.issues, entryPath, 'wrong_type', `expected table of contents entry object, got ${describeType(entry)}`);
      return;
    }
    const chapterId = readRequiredString(entry, 'chapterId', `${entryPath}.chapterId`, ctx, { nonEmpty: true });
    if (chapterId !== null) {
      ctx.tocRefs.push({ path: `${entryPath}.chapterId`, chapterId });
    }
    readRequiredString(entry, 'title', `${entryPath}.title`, ctx, { nonEmpty: true });
  });
}

/** Resolves navigation and TOC refs against the set of known chapter ids. */
function resolveReferences(ctx: ValidationContext): void {
  const chapterIdSet = new Set(ctx.chapterIds);
  for (const ref of ctx.navigationRefs) {
    if (!chapterIdSet.has(ref.chapterId)) {
      push(ctx.issues, ref.path, 'reference_not_found', `references unknown chapter id ${JSON.stringify(ref.chapterId)}`);
    }
  }
  for (const ref of ctx.tocRefs) {
    if (!chapterIdSet.has(ref.chapterId)) {
      push(ctx.issues, ref.path, 'reference_not_found', `references unknown chapter id ${JSON.stringify(ref.chapterId)}`);
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Public API
 * ------------------------------------------------------------------------- */

/** Validates a whole Book (structure + cross-references). */
export function validateBook(input: unknown): ValidationResult<Book> {
  const ctx = createContext();
  if (!isRecord(input)) {
    push(ctx.issues, '$', 'invalid_root', `expected book object, got ${describeType(input)}`);
    return finish(ctx, input);
  }

  const version = input['schemaVersion'];
  if (version === undefined) {
    push(ctx.issues, '$.schemaVersion', 'missing_field', 'missing required field "schemaVersion"');
  } else if (typeof version !== 'number') {
    push(ctx.issues, '$.schemaVersion', 'wrong_type', `field "schemaVersion" expected number, got ${describeType(version)}`);
  } else if (version !== SCHEMA_VERSION) {
    push(ctx.issues, '$.schemaVersion', 'schema_version_mismatch', `unsupported schema version ${JSON.stringify(version)}; this validator only supports ${SCHEMA_VERSION}`);
  }

  checkId(input, '$', ctx);

  readRequiredString(input, 'slug', '$.slug', ctx, { nonEmpty: true });
  readRequiredString(input, 'title', '$.title', ctx, { nonEmpty: true });
  readOptionalString(input, 'subtitle', '$.subtitle', ctx);
  readRequiredString(input, 'language', '$.language', ctx, { nonEmpty: true });
  readOptionalString(input, 'description', '$.description', ctx);

  checkAuthors(input, '$.authors', ctx);
  checkOptionalObject(input, 'cover', '$.cover', ctx, checkCover);
  checkOptionalObject(input, 'edition', '$.edition', ctx, checkEdition);
  checkOptionalObject(input, 'publication', '$.publication', ctx, checkPublication);
  checkOptionalObject(input, 'price', '$.price', ctx, checkPrice);
  checkOptionalObject(input, 'audience', '$.audience', ctx, checkAudience);
  checkOptionalObject(input, 'difficulty', '$.difficulty', ctx, checkDifficulty);
  checkOptionalObject(input, 'tableOfContents', '$.tableOfContents', ctx, checkTableOfContents);

  readOptionalArrayOfStrings(input, 'tags', '$.tags', ctx);

  const chapters = input['chapters'];
  if (chapters === undefined) {
    push(ctx.issues, '$.chapters', 'missing_field', 'missing required field "chapters"');
  } else if (!Array.isArray(chapters)) {
    push(ctx.issues, '$.chapters', 'wrong_type', `field "chapters" expected array, got ${describeType(chapters)}`);
  } else if (chapters.length === 0) {
    push(ctx.issues, '$.chapters', 'missing_items', 'field "chapters" must contain at least one chapter');
  } else {
    chapters.forEach((chapter, index) => {
      const chapterPath = `chapters[${index}]`;
      if (!isRecord(chapter)) {
        push(ctx.issues, chapterPath, 'wrong_type', `expected chapter object, got ${describeType(chapter)}`);
        return;
      }
      checkChapter(chapter, chapterPath, ctx);
    });
  }

  resolveReferences(ctx);
  return finish(ctx, input);
}

/** Validates a Chapter in isolation (structure only; no cross-reference resolution). */
export function validateChapter(input: unknown): ValidationResult<Chapter> {
  const ctx = createContext();
  if (!isRecord(input)) {
    push(ctx.issues, '$', 'invalid_root', `expected chapter object, got ${describeType(input)}`);
    return finish(ctx, input);
  }
  checkChapter(input, '$', ctx);
  return finish(ctx, input);
}

/** Validates a single ContentBlock in isolation. */
export function validateContentBlock(input: unknown): ValidationResult<ContentBlock> {
  const ctx = createContext();
  validateBlock(input, '$', ctx);
  return finish(ctx, input);
}

/** Type guard backed by full validation. */
export function isBook(input: unknown): input is Book {
  return validateBook(input).ok;
}

/** Type guard backed by full validation. */
export function isContentBlock(input: unknown): input is ContentBlock {
  return validateContentBlock(input).ok;
}
