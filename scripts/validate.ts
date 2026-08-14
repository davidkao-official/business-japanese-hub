/**
 * Workflow: validate — deterministic content validation for every authoring
 * book under `books/`. Runs `validateBook` (src/content/validate.ts) on each
 * `books/<slug>/book.json`; any invalid book prints its `ContentIssue`s
 * (path / code / message) and makes the command exit non-zero, so an invalid
 * book fails before it can be published.
 *
 * Run: `pnpm workflow:validate`
 */

import { validateBook } from '../src/content/validate';
import { discoverBooks, formatIssue, relativePath } from './lib/books';
import type { LoadedBook } from './lib/books';

function validateOne(book: LoadedBook): boolean {
  const result = validateBook(book.raw);
  if (result.ok) {
    console.log(`ok   ${book.slug}  (${relativePath(book.bookJsonPath)})`);
    return true;
  }
  console.log(`ERR  ${book.slug}: ${result.issues.length} issue(s)`);
  for (const issue of result.issues) {
    console.log(`     - ${formatIssue(issue)}`);
  }
  return false;
}

function main(): number {
  const books = discoverBooks();
  if (books.length === 0) {
    console.log('No authoring books found under books/ (each book needs a <slug>/book.json).');
    return 0;
  }

  const results = books.map(validateOne);
  const failed = results.filter((ok) => !ok).length;

  if (failed > 0) {
    console.log(`\n${failed} of ${books.length} book(s) FAILED validation.`);
    return 1;
  }
  console.log(`\nAll ${books.length} book(s) passed validation.`);
  return 0;
}

process.exitCode = main();
