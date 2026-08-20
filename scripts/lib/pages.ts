import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Prepare a Vite build for GitHub Pages history-routing fallback. */
export function preparePagesOutput(outputDirectory: string): void {
  const indexPath = join(outputDirectory, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`GitHub Pages artifact is missing ${indexPath}`);
  }
  copyFileSync(indexPath, join(outputDirectory, '404.html'));
}
