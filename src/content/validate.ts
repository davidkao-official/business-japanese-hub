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

import { isValidBcp47Tag } from './bcp47';
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
   * Dot/bracket path to the offending node, e.g. "$.chapters[0].blocks[2].text".
   * The root of a Book validation is "$" and every nested path keeps that root
   * prefix, so a node always has a single canonical path spelling.
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
  | 'invalid_format'
  | 'unknown_block_type'
  | 'missing_discriminator'
  | 'row_width_mismatch'
  | 'duplicate_id'
  | 'duplicate_slug'
  | 'reference_not_found'
  | 'missing_items'
  | 'not_json_safe';

/** Discriminated result: either the validated value or the list of issues. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ContentIssue[] };

/** Type guard: is `value` a supported block type string? */
export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------------- *
 * Documented serialized formats
 * These contracts are documented in docs/content-model.md; the validator and
 * the docs must stay in sync. Each format is intentionally small and explicit.
 * ------------------------------------------------------------------------- */

/** `slug`: URL-safe single path segment (lowercase alphanumerics separated by single hyphens). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `publication.releasedAt`: date-only ISO 8601 (YYYY-MM-DD). */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `price.currency`: uppercase ISO 4217 3-letter code. */
const ISO4217_PATTERN = /^[A-Z]{3}$/;

type FormatValidator = (value: string) => boolean;

const isSlugFormat: FormatValidator = (value) => SLUG_PATTERN.test(value);

/** `language`: full BCP-47 language tag (RFC 5646 structural grammar; see ./bcp47). */
const isBcp47Format: FormatValidator = (value) => isValidBcp47Tag(value);

const isIso4217Format: FormatValidator = (value) => ISO4217_PATTERN.test(value);

/** Real-calendar check for a date-only ISO 8601 string (rejects e.g. 2026-02-30). */
function isIsoDateFormat(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/* ------------------------------------------------------------------------- *
 * Whole-tree JSON safety
 * The content contract promises plain, serializable data (see
 * docs/content-model.md §1). Known-field checks do not inspect unknown
 * forward-compatible properties, so before returning success we walk the ENTIRE
 * tree and reject values that would break `JSON.stringify` at publish time.
 * ------------------------------------------------------------------------- */

/** True only for plain objects (Object.prototype or null prototype), not class instances / Date / Map / Set. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** True for canonical array index keys ("0", "1", …). */
function isArrayIndexKey(key: string): boolean {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 4294967295 && String(index) === key;
}

/**
 * Recursively verifies a value is JSON-safe plain data. Covers unknown
 * forward-compatible properties that the known-field checks intentionally leave
 * alone, so build/publish validation fails before serialization would throw.
 *
 * Allowed: null, string, boolean, finite number, arrays, plain objects.
 * Rejected (as `not_json_safe`): BigInt, undefined, function, symbol, NaN /
 * ±Infinity, non-plain objects, sparse array holes, and cyclic references.
 *
 * Arrays are walked by numeric index via descriptors: sparse holes and accessor
 * indices are rejected, and any other own property (symbol keys, a hidden
 * non-enumerable `toJSON`, extra string keys) is rejected — `length` is the one
 * allowed array intrinsic. Objects are inspected through own property
 * descriptors (`Reflect.ownKeys` + `getOwnPropertyDescriptor`) so getters are
 * never invoked: symbol keys, non-enumerable properties, and accessor
 * properties are rejected; only enumerable string-keyed data properties are
 * recursed into.
 *
 * `ancestors` holds the objects on the current walk path; it is backtracked
 * after each subtree so shared-but-acyclic references remain valid.
 */
function checkJsonSafe(value: unknown, path: string, ctx: ValidationContext, ancestors: Set<object>): void {
  if (value === null) return;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (!Number.isFinite(value)) {
        push(ctx.issues, path, 'not_json_safe', `expected a finite number at "${path}", got ${String(value)}`);
      }
      return;
    case 'bigint':
    case 'function':
    case 'symbol':
      push(ctx.issues, path, 'not_json_safe', `expected a JSON-safe plain value at "${path}", got ${typeof value}`);
      return;
    case 'undefined':
      push(ctx.issues, path, 'not_json_safe', `expected a JSON-safe plain value at "${path}", got undefined`);
      return;
  }

  if (Array.isArray(value)) {
    // The JSON-safe plain-data contract only accepts canonical arrays. A custom
    // prototype may carry inherited serialization hooks (e.g. toJSON) that
    // Array.isArray and own-key inspection cannot see.
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      push(
        ctx.issues,
        path,
        'not_json_safe',
        `expected a canonical array at "${path}", got an array with a custom prototype`,
      );
      return;
    }
    if (ancestors.has(value)) {
      push(ctx.issues, path, 'not_json_safe', `cyclic reference detected at "${path}"`);
      return;
    }
    ancestors.add(value);

    // Numeric indices: walk 0..length-1, reject sparse holes (`in` detects them
    // where `forEach` would skip), and read each value through its descriptor
    // so an accessor index is rejected instead of invoked.
    for (let index = 0; index < value.length; index += 1) {
      const indexPath = `${path}[${index}]`;
      if (!(index in value)) {
        push(ctx.issues, indexPath, 'not_json_safe', `array has a missing (sparse) element at "${indexPath}"`);
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (descriptor === undefined || !('value' in descriptor)) {
        push(ctx.issues, indexPath, 'not_json_safe', `array index ${index} is an accessor at "${indexPath}"`);
        ctx.unsafeToRead = true;
        continue;
      }
      checkJsonSafe(descriptor.value, indexPath, ctx, ancestors);
    }

    // Any other own property is rejected: `length` is an array intrinsic and
    // numeric indices were handled above. A hidden non-enumerable `toJSON`, a
    // symbol key, or an extra string key would otherwise be ignored by the
    // index loop yet still influence JSON.stringify.
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue;
      const keyPath = typeof key === 'string' ? `${path}.${key}` : `${path}[${String(key)}]`;
      if (typeof key !== 'string') {
        push(ctx.issues, keyPath, 'not_json_safe', `symbol-keyed property is not JSON-safe at "${keyPath}"`);
        continue;
      }
      if (isArrayIndexKey(key) && Number(key) < value.length) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable) {
        push(ctx.issues, keyPath, 'not_json_safe', `non-enumerable own property is not JSON-safe at "${keyPath}"`);
        continue;
      }
      if (!('value' in descriptor)) {
        push(ctx.issues, keyPath, 'not_json_safe', `accessor property (getter/setter) is not JSON-safe at "${keyPath}"`);
        ctx.unsafeToRead = true;
        continue;
      }
      push(ctx.issues, keyPath, 'not_json_safe', `extra enumerable own property is not JSON-safe at "${keyPath}"`);
    }

    ancestors.delete(value);
    return;
  }

  if (!isPlainObject(value)) {
    push(
      ctx.issues,
      path,
      'not_json_safe',
      `expected a plain object at "${path}", got a non-plain object (${Object.prototype.toString.call(value)})`,
    );
    return;
  }
  if (ancestors.has(value)) {
    push(ctx.issues, path, 'not_json_safe', `cyclic reference detected at "${path}"`);
    return;
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const childPath = typeof key === 'string' ? `${path}.${key}` : `${path}[${String(key)}]`;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string') {
      push(ctx.issues, childPath, 'not_json_safe', `symbol-keyed property is not JSON-safe at "${childPath}"`);
      continue;
    }
    if (descriptor === undefined || !descriptor.enumerable) {
      push(ctx.issues, childPath, 'not_json_safe', `non-enumerable own property is not JSON-safe at "${childPath}"`);
      continue;
    }
    if (!('value' in descriptor)) {
      push(ctx.issues, childPath, 'not_json_safe', `accessor property (getter/setter) is not JSON-safe at "${childPath}"`);
      ctx.unsafeToRead = true;
      continue;
    }
    checkJsonSafe(descriptor.value, childPath, ctx, ancestors);
  }
  ancestors.delete(value);
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
  /**
   * True when reading the input for precise schema validation is unsafe: the
   * JSON-safety preflight found an accessor property (reading it could invoke a
   * getter), or a reflective operation failed (e.g. a Proxy trap threw). When
   * set, the schema pass is skipped; data-value issues (NaN, Infinity, …) do
   * not set this flag and still let the schema pass run to emit its stable
   * issue codes (e.g. `invalid_number`).
   */
  unsafeToRead: boolean;
}

function createContext(): ValidationContext {
  return {
    issues: [],
    ids: new Set(),
    chapterIds: [],
    chapterSlugs: new Set(),
    navigationRefs: [],
    tocRefs: [],
    unsafeToRead: false,
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

/**
 * Classifies the input's root shape WITHOUT letting a reflective-operation
 * failure escape: `Array.isArray` throws for a revoked Proxy, so it is only
 * invoked inside the try here. Returns true for a record. For any other input
 * it records the appropriate structured issue — `invalid_root` for ordinary
 * non-records (with `expected` in the message), `not_json_safe` when
 * classification itself threw (revoked Proxy / trapped input) — marks the
 * input unsafe to read, and returns false.
 */
function rootIsRecord(
  input: unknown,
  expected: string,
  ctx: ValidationContext,
): input is Record<string, unknown> {
  let isRecordShape: boolean;
  try {
    isRecordShape = isRecord(input);
  } catch {
    push(
      ctx.issues,
      '$',
      'not_json_safe',
      'unable to classify the value as JSON-safe plain data (a reflective operation threw)',
    );
    ctx.unsafeToRead = true;
    return false;
  }
  if (!isRecordShape) {
    push(ctx.issues, '$', 'invalid_root', `expected ${expected}, got ${describeType(input)}`);
    return false;
  }
  return true;
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

/** Reads a required string and enforces a documented serialized format. */
function readRequiredStringFormat(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
  format: FormatValidator,
  formatDescription: string,
): string | null {
  const value = readRequiredString(record, key, path, ctx, { nonEmpty: true });
  if (value === null) return null;
  if (!format(value)) {
    push(
      ctx.issues,
      path,
      'invalid_format',
      `field "${key}" must be ${formatDescription}; got ${JSON.stringify(value)}`,
    );
    return null;
  }
  return value;
}

/** Validates an optional string against a documented serialized format when present. */
function readOptionalStringFormat(
  record: Record<string, unknown>,
  key: string,
  path: string,
  ctx: ValidationContext,
  format: FormatValidator,
  formatDescription: string,
): void {
  const value = record[key];
  if (value === undefined) return;
  if (typeof value !== 'string') {
    push(ctx.issues, path, 'wrong_type', `field "${key}" expected string, got ${describeType(value)}`);
    return;
  }
  if (!format(value)) {
    push(
      ctx.issues,
      path,
      'invalid_format',
      `field "${key}" must be ${formatDescription}; got ${JSON.stringify(value)}`,
    );
  }
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
  if (typeof value !== 'number') {
    push(ctx.issues, path, 'wrong_type', `field "${key}" expected number, got ${describeType(value)}`);
    return undefined;
  }
  // NaN / ±Infinity are numbers but are not JSON-safe and must be rejected.
  if (!Number.isFinite(value)) {
    push(ctx.issues, path, 'invalid_number', `field "${key}" must be a finite number, got ${value}`);
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
  if (typeof level !== 'number') {
    push(ctx.issues, `${path}.level`, 'wrong_type', `field "level" expected a number, got ${describeType(level)}`);
    return;
  }
  if (!Number.isInteger(level)) {
    push(ctx.issues, `${path}.level`, 'invalid_number', `field "level" expected an integer, got ${level}`);
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

/** Reads a required string-array field; rejects missing fields and empty arrays. */
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
  if (Array.isArray(value) && value.length === 0) {
    push(ctx.issues, path, 'missing_items', `field "${key}" must contain at least one item`);
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

  const slug = readRequiredStringFormat(
    record,
    'slug',
    `${path}.slug`,
    ctx,
    isSlugFormat,
    'a URL-safe single path segment (lowercase letters, digits, single hyphens)',
  );
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
  } else if (typeof order !== 'number') {
    push(ctx.issues, `${path}.order`, 'wrong_type', `field "order" expected number, got ${describeType(order)}`);
  } else if (!Number.isInteger(order) || order < 1) {
    push(ctx.issues, `${path}.order`, 'invalid_number', `field "order" expected an integer >= 1, got ${order}`);
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
  const authors = readRequiredArray(record, 'authors', `${path}.authors`, ctx, { nonEmpty: true });
  if (authors === null) return;
  authors.forEach((author, index) => {
    const authorPath = `${path}.authors[${index}]`;
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
  } else if (typeof number !== 'number') {
    push(ctx.issues, `${path}.number`, 'wrong_type', `field "number" expected number, got ${describeType(number)}`);
  } else if (!Number.isInteger(number) || number < 1) {
    push(ctx.issues, `${path}.number`, 'invalid_number', `field "number" expected an integer >= 1, got ${number}`);
  }
  readOptionalString(record, 'label', `${path}.label`, ctx);
  readOptionalNumber(record, 'year', `${path}.year`, ctx, { integer: true });
}

function checkPublication(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  readRequiredStringEnum(record, 'status', PUBLICATION_STATUSES, `${path}.status`, ctx);
  readOptionalStringFormat(record, 'releasedAt', `${path}.releasedAt`, ctx, isIsoDateFormat, 'an ISO 8601 date (YYYY-MM-DD)');
}

function checkPrice(record: Record<string, unknown>, path: string, ctx: ValidationContext): void {
  readRequiredStringEnum(record, 'tier', PRICE_TIERS, `${path}.tier`, ctx);
  readOptionalNumber(record, 'amount', `${path}.amount`, ctx, { min: 0 });
  readOptionalStringFormat(record, 'currency', `${path}.currency`, ctx, isIso4217Format, 'an uppercase 3-letter ISO 4217 currency code');
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
  } else if (typeof level !== 'number') {
    push(ctx.issues, `${path}.level`, 'wrong_type', `field "level" expected a number, got ${describeType(level)}`);
  } else if (!Number.isInteger(level)) {
    push(ctx.issues, `${path}.level`, 'invalid_number', `field "level" expected an integer, got ${level}`);
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

/**
 * Runs the whole-tree JSON-safety walk and converts any reflective-operation
 * failure (e.g. a Proxy trap that throws during `getPrototypeOf`/`ownKeys`/
 * `getOwnPropertyDescriptor`) into a structured `not_json_safe` failure, so the
 * validator's non-throwing contract always holds. A trapped input is also
 * marked unsafe to read, so the precise schema pass is skipped rather than
 * risking another trap.
 */
function runJsonSafetyPreflight(input: unknown, ctx: ValidationContext): void {
  try {
    checkJsonSafe(input, '$', ctx, new Set<object>());
  } catch {
    push(
      ctx.issues,
      '$',
      'not_json_safe',
      'unable to inspect the value as JSON-safe plain data (a reflective operation threw)',
    );
    ctx.unsafeToRead = true;
  }
}

/**
 * Runs the precise schema-validation phase behind a single exception boundary.
 * The JSON-safety preflight only inspects descriptors, so a Proxy `get` trap
 * can still fire during the later field reads (e.g. `input['schemaVersion']`);
 * any such escape is converted to a structured `not_json_safe` failure instead
 * of a throw. Ordinary inputs never throw here, so their precise issue codes
 * and their deterministic ordering are unchanged.
 */
function runSchemaPhase(phase: () => void, ctx: ValidationContext): void {
  try {
    phase();
  } catch {
    push(
      ctx.issues,
      '$',
      'not_json_safe',
      'unable to read the value as JSON-safe plain data (a property read threw)',
    );
    ctx.unsafeToRead = true;
  }
}

/** Validates a whole Book (structure + cross-references). */
export function validateBook(input: unknown): ValidationResult<Book> {
  const ctx = createContext();
  if (!rootIsRecord(input, 'book object', ctx)) return finish(ctx, input);

  // JSON-safety preflight: a descriptor-safe walk over the whole tree (including
  // unknown forward-compatible properties). Accessor properties (or a Proxy that
  // throws while being inspected) make later property reads unsafe, so in that
  // case we return a structured failure WITHOUT reading any property. Data-value
  // issues (NaN, Infinity, …) do NOT skip the schema pass — it runs afterwards
  // and still emits its stable issue codes (e.g. invalid_number).
  runJsonSafetyPreflight(input, ctx);
  if (ctx.unsafeToRead) return finish(ctx, input);

  runSchemaPhase(() => validateBookStructure(input, ctx), ctx);
  return finish(ctx, input);
}

/**
 * Precise book schema validation. Runs behind `runSchemaPhase` so a Proxy `get`
 * trap (or any other user-controlled property read) cannot escape as a throw.
 */
function validateBookStructure(input: Record<string, unknown>, ctx: ValidationContext): void {
  const version = input['schemaVersion'];
  if (version === undefined) {
    push(ctx.issues, '$.schemaVersion', 'missing_field', 'missing required field "schemaVersion"');
  } else if (typeof version !== 'number') {
    push(ctx.issues, '$.schemaVersion', 'wrong_type', `field "schemaVersion" expected number, got ${describeType(version)}`);
  } else if (version !== SCHEMA_VERSION) {
    push(ctx.issues, '$.schemaVersion', 'schema_version_mismatch', `unsupported schema version ${JSON.stringify(version)}; this validator only supports ${SCHEMA_VERSION}`);
  }

  checkId(input, '$', ctx);

  readRequiredStringFormat(input, 'slug', '$.slug', ctx, isSlugFormat, 'a URL-safe single path segment (lowercase letters, digits, single hyphens)');
  readRequiredString(input, 'title', '$.title', ctx, { nonEmpty: true });
  readOptionalString(input, 'subtitle', '$.subtitle', ctx);
  readRequiredStringFormat(input, 'language', '$.language', ctx, isBcp47Format, 'a BCP-47 language tag');
  readOptionalString(input, 'description', '$.description', ctx);

  checkAuthors(input, '$', ctx);
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
      const chapterPath = `$.chapters[${index}]`;
      if (!isRecord(chapter)) {
        push(ctx.issues, chapterPath, 'wrong_type', `expected chapter object, got ${describeType(chapter)}`);
        return;
      }
      checkChapter(chapter, chapterPath, ctx);
    });
  }

  resolveReferences(ctx);
}

/** Validates a Chapter in isolation (structure only; no cross-reference resolution). */
export function validateChapter(input: unknown): ValidationResult<Chapter> {
  const ctx = createContext();
  if (!rootIsRecord(input, 'chapter object', ctx)) return finish(ctx, input);
  runJsonSafetyPreflight(input, ctx);
  if (ctx.unsafeToRead) return finish(ctx, input);
  runSchemaPhase(() => checkChapter(input, '$', ctx), ctx);
  return finish(ctx, input);
}

/** Validates a single ContentBlock in isolation. */
export function validateContentBlock(input: unknown): ValidationResult<ContentBlock> {
  const ctx = createContext();
  runJsonSafetyPreflight(input, ctx);
  if (ctx.unsafeToRead) return finish(ctx, input);
  runSchemaPhase(() => validateBlock(input, '$', ctx), ctx);
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
