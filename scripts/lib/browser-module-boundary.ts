import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { isPrivatePracticeAuthoringArtifact, stripViteSpecifierSuffix } from './practice-content-boundary'
import type { ViteAlias } from './vite-build-input'
import { viteHtmlModuleScripts } from './vite-html-entry'

function isFixtureSpecifier(specifier: string, sourcePath: string): boolean {
  const localSpecifier = stripViteSpecifierSuffix(specifier)
  if (localSpecifier.includes('/fixtures/') || localSpecifier.startsWith('./fixtures/') || localSpecifier.startsWith('../fixtures/')) return true
  return join(sourcePath, '..', localSpecifier).includes('/src/practice-web-test/fixtures/')
}

function aliasMatch(specifier: string, alias: ViteAlias): string | null {
  if (alias.find instanceof RegExp) {
    alias.find.lastIndex = 0
    const matches = alias.find.test(specifier)
    alias.find.lastIndex = 0
    return matches ? specifier.replace(alias.find, alias.replacement) : null
  }
  if (specifier === alias.find) return alias.replacement
  if (specifier.startsWith(alias.find.endsWith('/') ? alias.find : `${alias.find}/`)) return `${alias.replacement}${specifier.slice(alias.find.length)}`
  return null
}

/** Resolves local Vite module edges, including resource queries and string aliases. */
export function resolveLocalModule(specifier: string, sourcePath: string, viteRoot: string, aliases: readonly ViteAlias[] = []): string | null {
  const localSpecifier = stripViteSpecifierSuffix(specifier)
  const aliasedSpecifier = aliases.map((alias) => aliasMatch(localSpecifier, alias)).find((candidate): candidate is string => candidate !== null)
  if (!localSpecifier.startsWith('.') && !localSpecifier.startsWith('/') && aliasedSpecifier === undefined) return null
  const candidate = aliasedSpecifier === undefined
    ? localSpecifier.startsWith('/') ? resolve(viteRoot, `.${localSpecifier}`) : resolve(dirname(sourcePath), localSpecifier)
    : resolve(viteRoot, aliasedSpecifier)
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs', '.json', '.csv']
  const paths = extname(candidate) ? [candidate] : [candidate, ...extensions.map((extension) => `${candidate}${extension}`), ...extensions.map((extension) => join(candidate, `index${extension}`))]
  return paths.find((path) => existsSync(path) && statSync(path).isFile()) ?? null
}

/** Walks literal browser module edges and fails closed when private artifacts become reachable. */
export function hasUnsafeBrowserModuleGraph(path: string, repositoryRoot: string, visited = new Set<string>(), viteRoot = repositoryRoot, sourceText?: string, aliases: readonly ViteAlias[] = []): boolean {
  if (visited.has(path)) return false
  visited.add(path)
  if (isPrivatePracticeAuthoringArtifact(path, sourceText ?? readFileSync(path, 'utf8'))) {
    console.error(`ERR  private Practice authoring artifact is reachable from a browser module graph: ${relative(repositoryRoot, path)}`)
    return true
  }
  const source = ts.createSourceFile(path, sourceText ?? readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  let unsafe = false
  const inspectSpecifier = (node: ts.Expression, label: string): void => {
    if (!ts.isStringLiteralLike(node)) {
      console.error(`ERR  production module has non-literal ${label}: ${relative(repositoryRoot, path)}`)
      unsafe = true
      return
    }
    if (isFixtureSpecifier(node.text, path)) {
      console.error(`ERR  production module imports a public Practice fixture: ${relative(repositoryRoot, path)}`)
      unsafe = true
    }
    const imported = resolveLocalModule(node.text, path, viteRoot, aliases)
    if (imported && hasUnsafeBrowserModuleGraph(imported, repositoryRoot, visited, viteRoot, undefined, aliases)) unsafe = true
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) inspectSpecifier(node.moduleSpecifier, 'import')
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) inspectSpecifier(node.moduleSpecifier, 'export-from')
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]) inspectSpecifier(node.arguments[0], 'dynamic import')
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments[0]) inspectSpecifier(node.arguments[0], 'require')
      if (ts.isPropertyAccessExpression(node.expression) && (node.expression.name.text === 'glob' || node.expression.name.text === 'globEager') && ts.isMetaProperty(node.expression.expression) && node.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword && node.arguments[0]) inspectSpecifier(node.arguments[0], 'import.meta.glob')
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) && node.expression.text === 'URL' &&
      node.arguments?.[0] && node.arguments[1] &&
      ts.isPropertyAccessExpression(node.arguments[1]) && node.arguments[1].name.text === 'url' &&
      ts.isMetaProperty(node.arguments[1].expression) && node.arguments[1].expression.keywordToken === ts.SyntaxKind.ImportKeyword
    ) inspectSpecifier(node.arguments[0], 'new URL asset')
    ts.forEachChild(node, visit)
  }
  visit(source)
  return unsafe
}

export function hasFixtureHtmlEntryBypass(path: string, repositoryRoot: string, viteRoot: string, aliases: readonly ViteAlias[] = []): boolean {
  const html = readFileSync(path, 'utf8')
  let unsafe = false
  for (const { source, content } of viteHtmlModuleScripts(html)) {
    if (source) {
      if (isFixtureSpecifier(source, path)) {
        console.error(`ERR  Vite HTML entry imports a public Practice fixture: ${relative(repositoryRoot, path)}`)
        unsafe = true
      }
      const imported = resolveLocalModule(source, path, viteRoot, aliases)
      if (imported && hasUnsafeBrowserModuleGraph(imported, repositoryRoot, new Set(), viteRoot, undefined, aliases)) unsafe = true
    } else if (hasUnsafeBrowserModuleGraph(path, repositoryRoot, new Set(), viteRoot, content, aliases)) unsafe = true
  }
  return unsafe
}
