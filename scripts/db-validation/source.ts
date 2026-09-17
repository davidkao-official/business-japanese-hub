export interface CommittedDbEntry {
  mode: '100644' | '100755'
  path: string
}

const DB_ENTRY = /^(100644|100755) blob [a-f0-9]+\t(supabase\/(?:config\.toml|(?:migrations|tests)\/[\w./-]+))$/

export function parseCommittedDbTree(tree: string): CommittedDbEntry[] {
  if (!tree.trim()) throw new Error('No committed DB inputs')
  return tree.trim().split('\n').map(entry => {
    const match = DB_ENTRY.exec(entry)
    if (!match || match[2].split('/').some(part => part === '.' || part === '..')) {
      throw new Error('Unsupported DB source entry')
    }
    return { mode: match[1] as CommittedDbEntry['mode'], path: match[2] }
  })
}

export function committedTestPaths(entries: readonly CommittedDbEntry[]): string[] {
  return entries.filter(entry => entry.path.startsWith('supabase/tests/')).map(entry => entry.path).sort()
}
