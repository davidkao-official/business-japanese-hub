#!/usr/bin/env node

import { createHash } from 'node:crypto'
import console from 'node:console'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const functionsRoot = path.join(repositoryRoot, 'supabase', 'functions')
const ignoredDirectories = new Set(['.git', '.next', '.turbo', 'dist', 'node_modules', 'target'])

async function findPackageJsonFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await findPackageJsonFiles(absolutePath))
    else if (entry.isFile() && entry.name === 'package.json') files.push(absolutePath)
  }
  return files.sort()
}

async function packageJsonSnapshot() {
  const files = await findPackageJsonFiles(repositoryRoot)
  return new Map(await Promise.all(files.map(async (file) => [
    file,
    createHash('sha256').update(await readFile(file)).digest('hex'),
  ])))
}

const packageJsonBefore = await packageJsonSnapshot()
const functions = (await readdir(functionsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort()
const failures = []

for (const functionName of functions) {
  const entrypoint = path.join(functionsRoot, functionName, 'index.ts')
  try {
    await readFile(entrypoint)
  } catch {
    failures.push(`${functionName}: missing index.ts entrypoint`)
    continue
  }

  const result = spawnSync('deno', ['info', '--json', entrypoint], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, DENO_NO_PACKAGE_JSON: '1', DENO_NO_UPDATE_CHECK: '1' },
    maxBuffer: 16 * 1024 * 1024,
  })

  let graph
  try {
    graph = JSON.parse(result.stdout)
  } catch {
    failures.push(`${functionName}: deno info did not return valid JSON (exit ${result.status ?? 'unknown'}): ${result.stderr.trim()}`)
    continue
  }

  const graphErrors = (graph.modules ?? [])
    .filter((module) => typeof module.error === 'string')
    .map((module) => `${module.specifier}: ${module.error}`)
  const workspaceSymlinks = (graph.modules ?? [])
    .map((module) => module.specifier ?? '')
    .filter((specifier) => specifier.startsWith('file:') && specifier.includes('/node_modules/@business-japanese-hub/'))
  const workspacePackageImports = (graph.modules ?? [])
    .flatMap((module) => module.dependencies ?? [])
    .map((dependency) => dependency.specifier ?? '')
    .filter((specifier) => specifier.startsWith('@business-japanese-hub/'))

  if (result.status !== 0) failures.push(`${functionName}: deno info exited ${result.status}: ${result.stderr.trim()}`)
  if (!Array.isArray(graph.roots) || graph.roots.length !== 1) failures.push(`${functionName}: expected one graph root`)
  if (graphErrors.length > 0) failures.push(`${functionName}: graph errors: ${graphErrors.join('; ')}`)
  if (workspaceSymlinks.length > 0) failures.push(`${functionName}: workspace package symlinks entered graph: ${workspaceSymlinks.join(', ')}`)
  if (workspacePackageImports.length > 0) failures.push(`${functionName}: workspace package imports remain: ${workspacePackageImports.join(', ')}`)

  const moduleCount = Array.isArray(graph.modules) ? graph.modules.length : 0
  if (graphErrors.length === 0 && result.status === 0) console.log(`PASS ${functionName}: ${moduleCount} resolved modules`)
}

const packageJsonAfter = await packageJsonSnapshot()
const changedPackageJson = [...new Set([...packageJsonBefore.keys(), ...packageJsonAfter.keys()])]
  .filter((file) => packageJsonBefore.get(file) !== packageJsonAfter.get(file))
if (changedPackageJson.length > 0) {
  failures.push(`Deno changed checked-out package.json files: ${changedPackageJson.map((file) => path.relative(repositoryRoot, file)).join(', ')}`)
}

if (failures.length > 0) {
  console.error('Edge import graph check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`All ${functions.length} Edge Function entrypoint graphs resolve without package.json discovery or workspace symlinks.`)
}
