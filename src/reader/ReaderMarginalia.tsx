import type { Chapter, VocabularyBlock } from '../content/types'
import { useStrings } from '../i18n/strings'

export interface ReaderMarginaliaProps {
  chapter: Chapter
  vocab: VocabularyBlock[]
}

/**
 * Right-rail marginalia (research §8.2). Shown only when the chapter actually
 * carries vocabulary — no empty rail for chapters without annotation material.
 */
export function ReaderMarginalia({ chapter, vocab }: ReaderMarginaliaProps) {
  const strings = useStrings()

  return (
    <aside className="reader-marginalia" aria-label={strings.reader.vocab}>
      <h2 className="reader-marginalia__title">{strings.reader.vocab}</h2>
      <ol className="reader-marginalia__list">
        {vocab.map((entry) => (
          <li key={entry.id} className="reader-marginalia__item">
            <p className="reader-marginalia__term">
              {entry.term}
              {entry.reading && <span className="reader-marginalia__reading">（{entry.reading}）</span>}
            </p>
            <p className="reader-marginalia__meaning">{entry.meaning}</p>
          </li>
        ))}
      </ol>
      <p className="reader-marginalia__chapter">{strings.reader.chapterLabel(chapter.order)}</p>
    </aside>
  )
}
