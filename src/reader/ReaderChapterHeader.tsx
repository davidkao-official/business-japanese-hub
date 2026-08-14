import type { Chapter } from '../content/types'
import { useStrings } from '../i18n/strings'

/** Chapter opener: label, title, subtitle, summary. The single `<h1>` of the chapter document. */
export function ReaderChapterHeader({ chapter }: { chapter: Chapter }) {
  const strings = useStrings()

  return (
    <header className="reader-chapter-header">
      <p className="reader-chapter-header__label">{strings.reader.chapterLabel(chapter.order)}</p>
      <h1 className="reader-chapter-header__title">{chapter.title}</h1>
      {chapter.subtitle && <p className="reader-chapter-header__subtitle">{chapter.subtitle}</p>}
      {chapter.summary && <p className="reader-chapter-header__summary">{chapter.summary}</p>}
    </header>
  )
}
