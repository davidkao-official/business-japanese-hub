/** Shared request/import identity contract for private content releases. */
export const PRIVATE_CONTENT_ID = /^[A-Za-z0-9._:-]{1,128}$/
export const PRIVATE_CONTENT_REVISION = /^[a-f0-9]{64}$/

export function isPrivateContentId(value: string): boolean {
  return PRIVATE_CONTENT_ID.test(value)
}
