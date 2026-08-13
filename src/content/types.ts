/**
 * Content model types for the Business Japanese Hub.
 *
 * The model follows the product abstraction `Book → Chapter → ContentBlock`
 * (see docs/product-contract.md §5). It is deliberately generic: no field or
 * block assumes the topic of the first book. All content is plain, serializable
 * data — there is no React, no JSX, and no product-specific code path — so it
 * can be authored, validated, stored, and rendered independently of the
 * presentation layer.
 *
 * Versioning: `SCHEMA_VERSION` is bumped ONLY on breaking changes. See
 * docs/content-model.md for the migration strategy.
 */

/**
 * Current schema version of the content model.
 *
 * Semantics:
 * - Breaking changes (field removal, type change, required → optional,
 *   discriminator rename, behavioral change) bump this integer.
 * - Non-breaking additions (a new optional field, a new block type) do NOT bump
 *   it; the validator tolerates unknown extra fields for forward compatibility.
 */
export const SCHEMA_VERSION = 1 as const;

/**
 * Canonical list of supported content block types.
 *
 * The vocabulary is intentionally small but extensible. To add a block type,
 * follow the steps in docs/content-model.md (§"新增一個 block type").
 */
export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'image',
  'quote',
  'callout',
  'table',
  'vocabulary',
  'dialogue',
  'example',
  'comparison',
  'caseStudy',
  'doDont',
  'exercise',
  'authorNote',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** Visual variants for the `callout` block. */
export const CALLOUT_KINDS = ['note', 'tip', 'warning', 'info'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/** Publication lifecycle states for a Book. */
export const PUBLICATION_STATUSES = ['draft', 'review', 'published', 'archived'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/** Access tiers for a Book's price/access metadata. */
export const PRICE_TIERS = ['free', 'preview', 'paid'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

/** Allowed heading levels; `level` defaults to 2 when omitted. */
export const HEADING_LEVELS = [1, 2, 3, 4] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Allowed difficulty levels (1 = easiest … 5 = hardest). */
export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/** Base fields shared by every content block. */
export interface BlockBase {
  /**
   * Stable, globally unique (across the whole book) identifier. Used for
   * cross-references, future annotations and localization. Must be a non-empty
   * string and must not collide with any other book/chapter/block id.
   */
  id: string;
  /** Discriminator selecting the block variant. */
  type: BlockType;
}

/* ------------------------------------------------------------------------- *
 * Content blocks
 * ------------------------------------------------------------------------- */

/** Prose / paragraph. */
export interface ParagraphBlock extends BlockBase {
  type: 'paragraph';
  text: string;
}

/** Section heading. Headings (level 2) also delineate sections inside a chapter. */
export interface HeadingBlock extends BlockBase {
  type: 'heading';
  text: string;
  /** Section level 1–4; defaults to 2 when omitted. */
  level?: HeadingLevel;
}

/** Image / figure with accessibility text and optional caption/credit. */
export interface ImageBlock extends BlockBase {
  type: 'image';
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
  width?: number;
  height?: number;
}

/** Quoted text with optional attribution. */
export interface QuoteBlock extends BlockBase {
  type: 'quote';
  text: string;
  attribution?: string;
}

/** Callout / note box (note, tip, warning, info). */
export interface CalloutBlock extends BlockBase {
  type: 'callout';
  kind: CalloutKind;
  title?: string;
  text: string;
}

/** Structured table. */
export interface TableBlock extends BlockBase {
  type: 'table';
  caption?: string;
  /** Column headers; every row must have exactly this many cells. */
  columns: string[];
  rows: string[][];
}

/** Vocabulary / terminology entry (term, meaning, optional reading/part-of-speech). */
export interface VocabularyBlock extends BlockBase {
  type: 'vocabulary';
  term: string;
  reading?: string;
  meaning: string;
  partOfSpeech?: string;
  example?: string;
}

/** One exchange in a dialogue. */
export interface DialogueLine {
  speaker: string;
  text: string;
  note?: string;
}

/** A conversational exchange (e.g. a meeting script). */
export interface DialogueBlock extends BlockBase {
  type: 'dialogue';
  /** Situational context, e.g. "a meeting between a manager and a new employee". */
  context?: string;
  lines: DialogueLine[];
}

/** Usage example with optional translation and note. */
export interface ExampleBlock extends BlockBase {
  type: 'example';
  text: string;
  translation?: string;
  note?: string;
}

/** One option being compared, with bullet points. */
export interface ComparisonRow {
  /** Option label, e.g. "尊敬語". */
  label: string;
  /** Bullet points describing this option. */
  points: string[];
}

/** Side-by-side comparison of labeled options (e.g. 敬語 categories). */
export interface ComparisonBlock extends BlockBase {
  type: 'comparison';
  title?: string;
  rows: ComparisonRow[];
}

/** A scenario-based case study. */
export interface CaseStudyBlock extends BlockBase {
  type: 'caseStudy';
  title?: string;
  scenario: string;
  questions?: string[];
  outcome?: string;
}

/** Do / don't checklist. */
export interface DoDontBlock extends BlockBase {
  type: 'doDont';
  title?: string;
  do: string[];
  dont: string[];
}

/** Exercise / quiz with optional hint, options, answer and explanation. */
export interface ExerciseBlock extends BlockBase {
  type: 'exercise';
  question: string;
  hint?: string;
  /** Optional multiple-choice options. */
  options?: string[];
  answer?: string;
  explanation?: string;
}

/** Author / expert note. */
export interface AuthorNoteBlock extends BlockBase {
  type: 'authorNote';
  author?: string;
  title?: string;
  text: string;
}

/**
 * Discriminated union of all supported content blocks. The `type` field is the
 * discriminator: a block whose `type` is not one of `BLOCK_TYPES` is invalid.
 */
export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | ImageBlock
  | QuoteBlock
  | CalloutBlock
  | TableBlock
  | VocabularyBlock
  | DialogueBlock
  | ExampleBlock
  | ComparisonBlock
  | CaseStudyBlock
  | DoDontBlock
  | ExerciseBlock
  | AuthorNoteBlock;

/* ------------------------------------------------------------------------- *
 * Chapter
 * ------------------------------------------------------------------------- */

/** Chapter navigation metadata. Refs are chapter ids within the same book. */
export interface ChapterNavigation {
  /** Chapter id of the previous chapter (must exist in the same book). */
  previous?: string;
  /** Chapter id of the next chapter (must exist in the same book). */
  next?: string;
}

export interface Chapter {
  /** Stable, globally unique id (see BlockBase.id). */
  id: string;
  /** URL-safe slug, unique within the book. */
  slug: string;
  /** 1-based display order within the book. */
  order: number;
  title: string;
  subtitle?: string;
  summary?: string;
  /** Ordered content blocks; headings (level 2) delineate sections within the chapter. */
  blocks: ContentBlock[];
  navigation?: ChapterNavigation;
}

/* ------------------------------------------------------------------------- *
 * Book metadata
 * ------------------------------------------------------------------------- */

export interface Author {
  id?: string;
  name: string;
  role?: string;
  bio?: string;
  website?: string;
}

export interface Cover {
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
  width?: number;
  height?: number;
}

export interface Edition {
  /** 1-based edition number. */
  number: number;
  label?: string;
  year?: number;
}

export interface PublicationState {
  status: PublicationStatus;
  /** ISO 8601 date string, e.g. "2026-04-01". */
  releasedAt?: string;
}

export interface Price {
  tier: PriceTier;
  /** Display amount in the currency's major unit; not used for arithmetic. */
  amount?: number;
  /** ISO 4217 currency code, e.g. "JPY". */
  currency?: string;
}

export interface Audience {
  /** Free-form proficiency labels, e.g. "beginner", "intermediate". */
  levels?: string[];
  /** Learner native language codes, e.g. "zh-TW", "en". */
  languages?: string[];
  description?: string;
}

export interface Difficulty {
  /** 1–5; 1 = easiest, 5 = hardest. */
  level: DifficultyLevel;
  label?: string;
  description?: string;
}

export interface TableOfContentsEntry {
  /** Must reference an existing chapter id. */
  chapterId: string;
  title: string;
}

export interface TableOfContents {
  entries: TableOfContentsEntry[];
}

/**
 * A single published unit. Every field is book-level metadata (see
 * docs/product-contract.md §7); the platform must never assume the book's topic.
 */
export interface Book {
  /** Must equal `SCHEMA_VERSION`. */
  schemaVersion: typeof SCHEMA_VERSION;
  /** Stable, globally unique id (see BlockBase.id). */
  id: string;
  /** URL-safe slug used for routing. */
  slug: string;
  title: string;
  subtitle?: string;
  /** Primary content language as a BCP-47 code, e.g. "ja". */
  language: string;
  /** Short description / sales copy. */
  description?: string;
  authors: Author[];
  cover?: Cover;
  edition?: Edition;
  publication?: PublicationState;
  price?: Price;
  audience?: Audience;
  difficulty?: Difficulty;
  tableOfContents?: TableOfContents;
  tags?: string[];
  chapters: Chapter[];
}
