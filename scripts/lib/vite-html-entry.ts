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
