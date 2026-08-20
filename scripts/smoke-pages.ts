import { verifyPagesDeployment } from './lib/pages-smoke';

const pageUrl = process.argv[2];
if (!pageUrl) throw new Error('Usage: pnpm exec tsx scripts/smoke-pages.ts <page-url>');

await verifyPagesDeployment(pageUrl);
console.log(`ok   ${pageUrl}: root, assets, Book route, and purchase result are reachable`);
