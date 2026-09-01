import { verifyDeployment, type DeploymentProduct } from './lib/deployment-smoke'

const deploymentUrl = process.argv[2];
const productArgument = process.argv[3] ?? 'library'
const product: DeploymentProduct | undefined =
  productArgument === 'library' || productArgument === 'career-game'
    ? productArgument
    : undefined
if (!deploymentUrl || !product || process.argv.length > 4) {
  throw new Error(
    'Usage: pnpm exec tsx scripts/smoke-deployment.ts <deployment-url> [library|career-game]',
  )
}

await verifyDeployment(deploymentUrl, { product })
console.log(
  `ok   ${deploymentUrl}: ${product} root, typed assets, and SPA direct routes are reachable`,
)
