import type { Plugin } from 'vite'
import {
  createBuildInfo,
  resolveBuildCommitSha,
  type DeploymentBuildInfo,
  type DeploymentProduct,
} from './scripts/lib/deployment-identity.ts'

const BUILD_META_NAME = 'bjh-build'
const BUILD_INFO_FILE = 'build-info.json'
const CLOUDFLARE_HEADERS_FILE = '_headers'
const BUILD_INFO_HEADERS = `/${BUILD_INFO_FILE}\n  Cache-Control: no-store\n`

function buildMarker(info: DeploymentBuildInfo): string {
  return `<meta name="${BUILD_META_NAME}" content="${info.product}:${info.commitSha}" />`
}

/**
 * Embed the exact source commit in both HTML and a separately fetchable record.
 * The HTML marker catches a stale cached shell; build-info.json gives operators a
 * stable machine-readable endpoint that is explicitly no-store on Pages.
 */
export function deploymentIdentityPlugin(product: DeploymentProduct): Plugin {
  let cachedInfo: DeploymentBuildInfo | undefined
  const info = () => {
    cachedInfo ??= createBuildInfo(product, resolveBuildCommitSha())
    return cachedInfo
  }

  return {
    name: `business-japanese-hub:deployment-identity:${product}`,
    apply: 'build',
    transformIndexHtml(html) {
      const marker = buildMarker(info())
      const stripped = html.replace(
        /\s*<meta\s+name=["']bjh-build["'][^>]*\/?>/gi,
        '',
      )
      return stripped.replace('</head>', `    ${marker}\n  </head>`)
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: BUILD_INFO_FILE,
        source: `${JSON.stringify(info(), null, 2)}\n`,
      })
      this.emitFile({
        type: 'asset',
        fileName: CLOUDFLARE_HEADERS_FILE,
        source: BUILD_INFO_HEADERS,
      })
    },
  }
}
