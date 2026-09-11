export type ViteHtmlModuleScript = { source?: string; content: string }
export type ViteHtmlStylesheet = { source?: string; content: string }

function attributeValue(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`, 'i').exec(attributes)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

/** Extract only executable Vite module-script roots from an HTML entry. */
export function viteHtmlModuleScripts(html: string): ViteHtmlModuleScript[] {
  const entries: ViteHtmlModuleScript[] = []
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = match[1] ?? ''
    if (attributeValue(attributes, 'type')?.toLowerCase() === 'module') entries.push({ source: attributeValue(attributes, 'src'), content: match[2] ?? '' })
  }
  return entries
}

/** Extract Vite-processed external and inline stylesheet roots from an HTML entry. */
export function viteHtmlStylesheets(html: string): ViteHtmlStylesheet[] {
  const entries: ViteHtmlStylesheet[] = []
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = match[1] ?? ''
    if (attributeValue(attributes, 'rel')?.toLowerCase().split(/\s+/).includes('stylesheet')) {
      const source = attributeValue(attributes, 'href')
      if (source) entries.push({ source, content: '' })
    }
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    entries.push({ content: match[1] ?? '' })
  }
  return entries
}

/** Extract local-looking Vite HTML asset attributes beyond module/style roots. */
export function viteHtmlAssetReferences(html: string): string[] {
  const references: string[] = []
  for (const match of html.matchAll(/<[A-Za-z][^>]*>/g)) {
    const attributes = match[0]
    for (const name of ['src', 'href', 'poster']) {
      const source = attributeValue(attributes, name)
      if (source) references.push(source)
    }
    const sourceSet = attributeValue(attributes, 'srcset')
    if (sourceSet) {
      for (const candidate of sourceSet.split(',')) {
        const source = candidate.trim().split(/\s+/, 1)[0]
        if (source) references.push(source)
      }
    }
  }
  return [...new Set(references)]
}
