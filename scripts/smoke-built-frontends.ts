import { createServer, type Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { resolveBuildCommitSha } from './lib/deployment-identity'
import { verifyDeployment, type DeploymentProduct } from './lib/deployment-smoke'

interface BuiltFrontend {
  outputDirectory: string
  product: DeploymentProduct
}

const BUILT_FRONTENDS: readonly BuiltFrontend[] = [
  { outputDirectory: 'dist', product: 'library' },
  { outputDirectory: 'dist-career-game', product: 'career-game' },
]

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()))
  })
}

async function startSpaServer(outputDirectory: string): Promise<{ baseUrl: string; server: Server }> {
  const root = resolve(outputDirectory)
  const indexPath = resolve(root, 'index.html')
  await stat(indexPath)

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      const pathname = decodeURIComponent(requestUrl.pathname)
      const requestedPath = resolve(root, `.${pathname}`)
      const insideRoot = requestedPath === root || requestedPath.startsWith(`${root}${sep}`)
      const requestedFile = insideRoot ? requestedPath : indexPath
      const file = await stat(requestedFile).catch(() => undefined)
      const responsePath = file?.isFile() ? requestedFile : indexPath
      const body = await readFile(responsePath)
      const isHtml = responsePath === indexPath || extname(responsePath).toLowerCase() === '.html'
      const isBuildInfo = responsePath === resolve(root, 'build-info.json')
      const cacheControl = isBuildInfo
        ? 'no-store'
        : isHtml
          ? 'public, max-age=0, must-revalidate'
          : undefined
      response.writeHead(200, {
        'content-length': body.byteLength,
        'content-type': MEDIA_TYPES[extname(responsePath).toLowerCase()] ?? 'application/octet-stream',
        ...(cacheControl ? { 'cache-control': cacheControl } : {}),
      })
      response.end(body)
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(error instanceof Error ? error.message : 'local preview failure')
    }
  })

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error(`Could not resolve local preview address for ${outputDirectory}`)
  }
  return { baseUrl: `http://127.0.0.1:${address.port}/`, server }
}

const expectedCommitSha = resolveBuildCommitSha()
const servers: Server[] = []
try {
  for (const frontend of BUILT_FRONTENDS) {
    const preview = await startSpaServer(frontend.outputDirectory)
    servers.push(preview.server)
    await verifyDeployment(preview.baseUrl, {
      attempts: 1,
      expectedCommitSha,
      product: frontend.product,
      retryDelayMs: 0,
    })
    console.log(
      `ok   ${frontend.product}: ${frontend.outputDirectory}/ exact-head identity, cache policy, typed assets, and SPA direct routes`,
    )
  }
} finally {
  await Promise.all(servers.map(closeServer))
}
