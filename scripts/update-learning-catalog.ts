import { relative } from 'node:path';
import { repoRoot } from './lib/books';
import { writeLearningCatalog } from './lib/learning';

try {
  const path = writeLearningCatalog();
  console.log(`ok   wrote ${relative(repoRoot(), path)}`);
} catch (error) {
  console.error(`ERR  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
