import { describe, expect, it } from 'vitest';
import { sampleBook } from './fixtures/sample-book';
import { validateBook } from './validate';
import { BLOCK_TYPES, SCHEMA_VERSION } from './types';
import type { Book, ContentBlock } from './types';

/** Flatten every content block in the book, in document order. */
function allBlocks(book: Book): ContentBlock[] {
  return book.chapters.flatMap((chapter) => chapter.blocks);
}

describe('content model', () => {
  it('exposes the current schema version', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('the sample fixture is tagged with the current schema version', () => {
    expect(sampleBook.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('the sample fixture passes validation', () => {
    const result = validateBook(sampleBook);
    expect(result.ok).toBe(true);
  });

  it('the fixture exercises every supported block type', () => {
    const used = new Set(allBlocks(sampleBook).map((block) => block.type));
    for (const type of BLOCK_TYPES) {
      expect(used.has(type), `the fixture is missing a block of type "${type}"`).toBe(true);
    }
    expect(used.size).toBe(BLOCK_TYPES.length);
  });

  it('every id is unique across the whole book', () => {
    const ids = new Set<string>([sampleBook.id]);
    for (const chapter of sampleBook.chapters) {
      expect(ids.has(chapter.id), `duplicate chapter id "${chapter.id}"`).toBe(false);
      ids.add(chapter.id);
      for (const block of chapter.blocks) {
        expect(ids.has(block.id), `duplicate block id "${block.id}"`).toBe(false);
        ids.add(block.id);
      }
    }
  });

  it('chapters are ordered by their order field', () => {
    const orders = sampleBook.chapters.map((chapter) => chapter.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('the table of contents matches the chapters', () => {
    expect(sampleBook.tableOfContents).toBeDefined();
    expect(sampleBook.tableOfContents!.entries.map((entry) => entry.chapterId)).toEqual(
      sampleBook.chapters.map((chapter) => chapter.id),
    );
  });

  it('the discriminated union narrows block payloads by type', () => {
    const blocks = allBlocks(sampleBook);
    const paragraph = blocks.find((block) => block.type === 'paragraph');
    expect(paragraph).toBeDefined();
    // The `type` discriminant narrows the union; these are compile-time guarantees
    // that also hold at runtime.
    const text: string = paragraph!.text;
    expect(text.length).toBeGreaterThan(0);

    const table = blocks.find((block) => block.type === 'table');
    expect(table).toBeDefined();
    expect(table!.columns.length).toBeGreaterThan(0);
    expect(table!.rows.length).toBeGreaterThan(0);
  });

  it('content renders deterministically as plain data (no React/JSX)', () => {
    // A pure function of the data: the same input always produces the same text.
    const render = (blocks: ContentBlock[]): string =>
      blocks
        .map((block) => {
          switch (block.type) {
            case 'heading':
              return `# ${block.text}`;
            case 'paragraph':
              return block.text;
            case 'vocabulary':
              return `${block.term}: ${block.meaning}`;
            case 'dialogue':
              return block.lines.map((line) => `${line.speaker}: ${line.text}`).join('\n');
            case 'exercise':
              return `Q: ${block.question}`;
            case 'table':
              return block.columns.join(' | ');
            default:
              return `[${block.type}]`;
          }
        })
        .join('\n');

    const first = render(allBlocks(sampleBook));
    const second = render(allBlocks(sampleBook));
    expect(second).toBe(first);

    // The rendered output actually reflects the source data.
    expect(first).toContain('敬語とは');
    expect(first).toContain('尊敬語');
    expect(first).toContain('Q: 「行く」の尊敬語として正しいものを選んでください。');
    expect(first).toContain('場面 | 丁寧な表現 | カジュアル');
  });
});
