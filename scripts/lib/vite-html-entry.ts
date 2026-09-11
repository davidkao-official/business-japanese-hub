export type ViteHtmlModuleScript = { source?: string; content: string }
export type ViteHtmlStylesheet = { source?: string; content: string }

function htmlTags(html: string, tag: string): RegExpMatchArray[] {
  // Attribute values may contain `>`; consume quoted values atomically so an
  // asset attribute later in the tag cannot evade the boundary parser.
  return [...html.matchAll(new RegExp(`<${tag}\\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>`, 'gi'))]
}

function attributeValue(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`, 'i').exec(attributes)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

/** Extract only executable Vite module-script roots from an HTML entry. */
export function viteHtmlModuleScripts(html: string): ViteHtmlModuleScript[] {
  const entries: ViteHtmlModuleScript[] = []
  for (const match of html.matchAll(/<script\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = match[1] ?? ''
    if (attributeValue(attributes, 'type')?.toLowerCase() === 'module') entries.push({ source: attributeValue(attributes, 'src'), content: match[2] ?? '' })
  }
  return entries
}

/** Extract Vite-processed external and inline stylesheet roots from an HTML entry. */
export function viteHtmlStylesheets(html: string): ViteHtmlStylesheet[] {
  const entries: ViteHtmlStylesheet[] = []
  for (const match of htmlTags(html, 'link')) {
    const attributes = match[1] ?? ''
    if (attributeValue(attributes, 'rel')?.toLowerCase().split(/\s+/).includes('stylesheet')) {
      const source = attributeValue(attributes, 'href')
      if (source) entries.push({ source, content: '' })
    }
  }
  for (const match of html.matchAll(/<style\b(?:[^"'<>]|"[^"]*"|'[^']*')*>([\s\S]*?)<\/style\s*>/gi)) {
    entries.push({ content: match[1] ?? '' })
  }
  return entries
}

/** Inline classic scripts can contain Vite-rewritten dynamic imports too. */
export function viteHtmlInlineScripts(html: string): string[] {
  const scripts: string[] = []
  for (const match of html.matchAll(/<script\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = match[1] ?? ''
    if (attributeValue(attributes, 'src') === undefined) scripts.push(match[2] ?? '')
  }
  return scripts
}

/** Vite processes literal CSS `style` attributes as browser asset edges. */
export function viteHtmlInlineStyles(html: string): string[] {
  return htmlTags(html, '[A-Za-z][A-Za-z0-9:-]*')
    .map((match) => attributeValue(match[1] ?? '', 'style'))
    .filter((style): style is string => style !== undefined)
}

/** Extract local-looking Vite HTML asset attributes beyond module/style roots. */
export function viteHtmlAssetReferences(html: string): string[] {
  const references: string[] = []
  for (const match of htmlTags(html, '[A-Za-z][A-Za-z0-9:-]*')) {
    const attributes = match[1] ?? ''
    for (const name of ['src', 'href', 'poster', 'data', 'content']) {
      const source = attributeValue(attributes, name)
      if (source) references.push(source)
    }
    for (const sourceSet of [attributeValue(attributes, 'srcset'), attributeValue(attributes, 'imagesrcset')]) {
      if (sourceSet) {
        for (const candidate of sourceSet.split(',')) {
          const source = candidate.trim().split(/\s+/, 1)[0]
          if (source) references.push(source)
        }
      }
    }
  }
  return [...new Set(references)]
}
