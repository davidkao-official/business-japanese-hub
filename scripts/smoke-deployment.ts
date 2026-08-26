import { verifyDeployment } from './lib/deployment-smoke';

const deploymentUrl = process.argv[2];
if (!deploymentUrl) {
  throw new Error('Usage: pnpm exec tsx scripts/smoke-deployment.ts <deployment-url>');
}

await verifyDeployment(deploymentUrl);
console.log(`ok   ${deploymentUrl}: root, assets, and SPA direct routes are reachable`);
