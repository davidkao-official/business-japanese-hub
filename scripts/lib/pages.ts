import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** List published release slugs from the generic committed catalog input. */
export function publishedReleaseSlugs(contentDirectory: string): string[] {
  const booksDirectory = join(contentDirectory, 'books');
  if (!existsSync(booksDirectory)) return [];
  return readdirSync(booksDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      const currentPath = join(booksDirectory, entry.name, 'current.json');
      if (!existsSync(currentPath)) return false;
      const snapshot = JSON.parse(readFileSync(currentPath, 'utf8')) as {
        book?: { publication?: { status?: unknown }; slug?: unknown };
      };
      return snapshot.book?.publication?.status === 'published' && snapshot.book.slug === entry.name;
    })
    .map((entry) => entry.name)
    .sort();
}

/** Prepare a Vite build for GitHub Pages history-routing and smoke checks. */
export function preparePagesOutput(outputDirectory: string, bookSlugs: string[]): void {
  const indexPath = join(outputDirectory, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`GitHub Pages artifact is missing ${indexPath}`);
  }
  const normalizedSlugs = [...new Set(bookSlugs)].sort();
  if (
    normalizedSlugs.length === 0 ||
    normalizedSlugs.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
  ) {
    throw new Error('GitHub Pages artifact requires at least one valid published Book slug');
  }
  copyFileSync(indexPath, join(outputDirectory, '404.html'));
  writeFileSync(
    join(outputDirectory, 'deployment-manifest.json'),
    `${JSON.stringify({ bookSlugs: normalizedSlugs }, null, 2)}\n`,
    'utf8',
  );
}
