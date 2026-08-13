/**
 * RFC 5646 / BCP 47 language-tag structural validator.
 *
 * This module validates the *syntax* (well-formedness) of a language tag as
 * defined by RFC 5646 §2.1 / BCP 47. It is deliberately registry-free: a
 * subtag does not need to exist in the IANA Language Subtag Registry to be
 * well-formed. Grandfathered tags (RFC 5646 §2.2.8) are matched exactly,
 * case-insensitively, against the complete registered lists.
 *
 * Zero runtime dependencies: the platform's `Intl.getCanonicalLocales` is NOT
 * used because its Unicode-locale grammar rejects well-formed BCP 47 tags that
 * use extlang syntax (e.g. `zh-cmn`) or grandfathered syntax.
 */

/** Grandfathered tags that are exact strings (RFC 5646 §2.2.8, irregular). */
const GRANDFATHERED_IRREGULAR = [
  'en-gb-oed',
  'i-ami',
  'i-bnn',
  'i-default',
  'i-enochian',
  'i-hak',
  'i-klingon',
  'i-lux',
  'i-mingo',
  'i-navajo',
  'i-pwn',
  'i-tao',
  'i-tay',
  'i-tsu',
  'sgn-be-fr',
  'sgn-be-nl',
  'sgn-ch-de',
] as const;

/** Grandfathered tags that follow the regular structure (RFC 5646 §2.2.8, regular). */
const GRANDFATHERED_REGULAR = [
  'art-lojban',
  'cel-gaulish',
  'no-bok',
  'no-nyn',
  'zh-guoyu',
  'zh-hakka',
  'zh-min',
  'zh-min-nan',
  'zh-xiang',
] as const;

/** Exact, case-insensitive grandfathered registry match (no prefix leniency). */
function isGrandfathered(lower: string): boolean {
  return (
    (GRANDFATHERED_IRREGULAR as readonly string[]).includes(lower) ||
    (GRANDFATHERED_REGULAR as readonly string[]).includes(lower)
  );
}

/** `x` followed by one or more 1-8 alphanumeric subtags (RFC 5646 `privateuse`). */
function isPrivateUse(lower: string): boolean {
  const subtags = lower.split('-');
  if (subtags[0] !== 'x' || subtags.length < 2) return false;
  return subtags.slice(1).every((subtag) => /^[a-z0-9]{1,8}$/.test(subtag));
}

/**
 * The `langtag` grammar of RFC 5646 §2.1:
 *
 *   language ["-" script] ["-" region] *("-" variant) *("-" extension) ["-" privateuse]
 *
 * The input must already be lowercased. Subtags are validated in order, so an
 * out-of-order subtag is rejected. Duplicate variants and duplicate extension
 * singletons are rejected per BCP 47. Every subtag must be non-empty and use
 * only ASCII letters/digits.
 */
function isLangtag(lower: string): boolean {
  const subtags = lower.split('-');
  if (subtags.length === 0 || subtags.some((subtag) => subtag.length === 0)) return false;

  const n = subtags.length;
  let i = 0;

  // language: 2-3 letters (optionally followed by extlang), 4 letters
  // (reserved for future use), or 5-8 letters (registered/reserved).
  const language = subtags[i]!;
  if (!/^[a-z]{2,8}$/.test(language)) return false;
  i += 1;

  // extlang: up to 3 three-letter subtags, only after a 2-3 letter language.
  let extlangCount = 0;
  while (i < n && extlangCount < 3 && /^[a-z]{3}$/.test(subtags[i]!)) {
    extlangCount += 1;
    i += 1;
  }
  if (extlangCount > 0 && language.length > 3) return false;

  // script: exactly 4 letters.
  if (i < n && /^[a-z]{4}$/.test(subtags[i]!)) i += 1;

  // region: 2 letters or 3 digits.
  if (i < n && /^([a-z]{2}|\d{3})$/.test(subtags[i]!)) i += 1;

  // variants: 5-8 alphanumeric, or digit + 3 alphanumeric; no duplicates.
  const variants = new Set<string>();
  while (i < n && /^([a-z0-9]{5,8}|\d[a-z0-9]{3})$/.test(subtags[i]!)) {
    if (variants.has(subtags[i]!)) return false;
    variants.add(subtags[i]!);
    i += 1;
  }

  // extensions: singleton (digit or A-W / Y-Z; "x" is reserved for private
  // use) followed by one or more 2-8 alphanumeric subtags; duplicate singleton
  // extensions are rejected.
  const extensions = new Set<string>();
  while (i < n && /^[0-9a-wy-z]$/.test(subtags[i]!)) {
    const singleton = subtags[i]!;
    if (extensions.has(singleton)) return false;
    extensions.add(singleton);
    i += 1;
    let extensionSubtags = 0;
    while (i < n && /^[a-z0-9]{2,8}$/.test(subtags[i]!)) {
      extensionSubtags += 1;
      i += 1;
    }
    if (extensionSubtags === 0) return false; // dangling singleton
  }

  // private use: "x" + one or more 1-8 alphanumeric subtags, only at the end.
  if (i < n) {
    if (subtags[i] !== 'x') return false;
    i += 1;
    let privateSubtags = 0;
    while (i < n && /^[a-z0-9]{1,8}$/.test(subtags[i]!)) {
      privateSubtags += 1;
      i += 1;
    }
    if (privateSubtags === 0) return false;
  }

  return i === n;
}

/** Returns true when `value` is a well-formed BCP 47 language tag. */
export function isValidBcp47Tag(value: string): boolean {
  if (value.length === 0) return false;
  const lower = value.toLowerCase();
  if (isGrandfathered(lower)) return true;
  if (isPrivateUse(lower)) return true;
  return isLangtag(lower);
}
