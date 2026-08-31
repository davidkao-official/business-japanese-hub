import { verifyCommittedLearningCatalog } from './lib/learning';

try {
  const issues = verifyCommittedLearningCatalog();
  if (issues.length === 0) {
    console.log('ok   Library learning catalog is current');
  } else {
    for (const issue of issues) console.error(`ERR  ${issue}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`ERR  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
