import { resolveExpectedDeploymentSha } from './lib/deployment-identity'
import { verifyDeployment, type DeploymentProduct } from './lib/deployment-smoke'

const deploymentUrl = process.argv[2]
const productArgument = process.argv[3] ?? 'library'
const explicitExpectedSha = process.argv[4]
const product: DeploymentProduct | undefined =
  productArgument === 'library' || productArgument === 'career-game'
    ? productArgument
    : undefined
if (!deploymentUrl || !product || process.argv.length > 5) {
  throw new Error(
    'Usage: pnpm exec tsx scripts/smoke-deployment.ts <deployment-url> [library|career-game] [expected-commit-sha]',
  )
}

const expectedCommitSha = resolveExpectedDeploymentSha(product, {
  explicitSha: explicitExpectedSha,
})
await verifyDeployment(deploymentUrl, { expectedCommitSha, product })
console.log(
  `ok   ${deploymentUrl}: ${product} exact commit ${expectedCommitSha}, cache policy, typed assets, and SPA routes verified`,
)
