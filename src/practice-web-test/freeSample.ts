/**
 * Server-authoritative Free tier for Practice / Web Test.
 *
 * Only these public, non-proprietary sample releases may be practiced and
 * persisted by a signed-in account without Plus. Every other practice release
 * still requires an active membership window. Shared by the browser runner and
 * the `practice-attempts` / `my-learning` Edge Functions; the Edge Functions are
 * the enforcement point.
 */
export const FREE_SPI_SAMPLE_CONTENT_ID = 'practice-web-test-spi-free-sample-v1'
export const FREE_SPI_SAMPLE_REVISION = 'adf8b12615c26e9aad1b2f1fb73fc48d2033492449f1d275885a12569fa5ecb6'

export const FREE_PRACTICE_CONTENT_IDS: readonly string[] = [FREE_SPI_SAMPLE_CONTENT_ID]

export function isFreePracticeContentId(contentId: string): boolean {
  return FREE_PRACTICE_CONTENT_IDS.includes(contentId)
}
