/**
 * BlockRenderer — renders every supported content block (#3) with a deliberate
 * visual state. The reader is book-agnostic: this file knows the content model
 * and nothing about any specific title.
 *
 * Each block is wrapped in a shell carrying a stable fragment id (`block-<id>`),
 * a `data-block-anchor` for the reading-position hook, and `tabIndex={-1}` so a
 * TOC section link can hand keyboard focus to the target.
 *
 * Vocabulary terms are interactive: the term is a button that opens the
 * definition sheet (ReaderShell owns the sheet). Closing the sheet returns
 * focus to the term button — the reader's "footnote interaction" focus-return
 * contract.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  CalloutKind,
  ContentBlock,
  ExerciseBlock,
  VocabularyBlock,
} from '../content/types'
import { useStrings } from '../i18n/strings'

export interface BlockRendererProps {
  block: ContentBlock
  onOpenVocab: (block: VocabularyBlock) => void
  /** Id of the vocabulary block whose definition sheet is currently open. */
  openVocabBlockId?: string
}

function BlockShell({ block, children }: { block: ContentBlock; children: ReactNode }) {
  return (
    <div
      id={`block-${block.id}`}
      tabIndex={-1}
      className={`reader-block reader-block--${block.type}`}
      data-block-anchor={block.id}
      data-block-id={block.id}
    >
      {children}
    </div>
  )
}

const CALLOUT_LABEL_KEY: Record<
  CalloutKind,
  'calloutNote' | 'calloutTip' | 'calloutWarning' | 'calloutInfo'
> = {
  note: 'calloutNote',
  tip: 'calloutTip',
  warning: 'calloutWarning',
  info: 'calloutInfo',
}

/** Exercise with an inline answer reveal. Deliberately no scoring. */
function ExerciseView({ block }: { block: ExerciseBlock }) {
  const strings = useStrings()
  const [showAnswer, setShowAnswer] = useState(false)

  return (
    <div className="reader-exercise">
      <p className="reader-exercise__question">
        <strong className="reader-exercise__question-label">{strings.reader.exercise}: </strong>
        {block.question}
      </p>
      {block.hint && (
        <details className="reader-exercise__hint">
          <summary>{strings.reader.hint}</summary>
          <p>{block.hint}</p>
        </details>
      )}
      {block.options && block.options.length > 0 && (
        <ul className="reader-exercise__options">
          {block.options.map((option) => (
            <li key={option} className="reader-exercise__option">
              {option}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="reader-exercise__toggle"
        aria-expanded={showAnswer}
        onClick={() => setShowAnswer((current) => !current)}
      >
        {showAnswer ? strings.reader.hideAnswer : strings.reader.showAnswer}
      </button>
      {showAnswer && (
        <div className="reader-exercise__answer">
          {block.answer && (
            <p className="reader-exercise__answer-line">
              <strong>{strings.reader.answer}: </strong>
              {block.answer}
            </p>
          )}
          {block.explanation && (
            <p className="reader-exercise__explanation">
              <strong>{strings.reader.explanation}: </strong>
              {block.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function BlockRenderer({
  block,
  onOpenVocab,
  openVocabBlockId,
}: BlockRendererProps) {
  const strings = useStrings()

  switch (block.type) {
    case 'paragraph':
      return (
        <BlockShell block={block}>
          <p className="reader-paragraph">{block.text}</p>
        </BlockShell>
      )

    case 'heading': {
      const level = block.level ?? 2
      const Tag: 'h2' | 'h3' | 'h4' = level >= 4 ? 'h4' : level === 3 ? 'h3' : 'h2'
      return (
        <BlockShell block={block}>
          <Tag className="reader-heading">{block.text}</Tag>
        </BlockShell>
      )
    }

    case 'image':
      return (
        <BlockShell block={block}>
          <figure className="reader-figure">
            <img
              src={block.src}
              alt={block.alt}
              loading="lazy"
              width={block.width}
              height={block.height}
            />
            {block.caption && <figcaption className="reader-figure__caption">{block.caption}</figcaption>}
            {block.credit && <figcaption className="reader-figure__credit">{block.credit}</figcaption>}
          </figure>
        </BlockShell>
      )

    case 'quote':
      return (
        <BlockShell block={block}>
          <figure className="reader-quote">
            <blockquote className="reader-quote__text">{block.text}</blockquote>
            {block.attribution && (
              <figcaption className="reader-quote__attribution">— {block.attribution}</figcaption>
            )}
          </figure>
        </BlockShell>
      )

    case 'callout': {
      const kindLabel = strings.reader[CALLOUT_LABEL_KEY[block.kind]]
      return (
        <BlockShell block={block}>
          <aside className={`reader-callout reader-callout--${block.kind}`}>
            <p className="reader-callout__label">{kindLabel}</p>
            {block.title && <p className="reader-callout__title">{block.title}</p>}
            <p className="reader-callout__text">{block.text}</p>
          </aside>
        </BlockShell>
      )
    }

    case 'table':
      return (
        <BlockShell block={block}>
          <figure className="reader-table">
            {block.caption && <figcaption className="reader-table__caption">{block.caption}</figcaption>}
            <div className="reader-table__scroll">
              <table>
                <thead>
                  <tr>
                    {block.columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </figure>
        </BlockShell>
      )

    case 'vocabulary': {
      const open = openVocabBlockId === block.id
      return (
        <BlockShell block={block}>
          <dl className="reader-vocab">
            <div className="reader-vocab__entry">
              <dt className="reader-vocab__term-wrap">
                <button
                  type="button"
                  className="reader-vocab__term"
                  aria-expanded={open}
                  aria-haspopup="dialog"
                  onClick={() => onOpenVocab(block)}
                >
                  {block.term}
                </button>
                {block.reading && <span className="reader-vocab__reading">（{block.reading}）</span>}
              </dt>
              <dd className="reader-vocab__meaning">{block.meaning}</dd>
              {block.partOfSpeech && <dd className="reader-vocab__pos">{block.partOfSpeech}</dd>}
              {block.example && (
                <dd className="reader-vocab__example">
                  {strings.reader.example}: {block.example}
                </dd>
              )}
            </div>
          </dl>
        </BlockShell>
      )
    }

    case 'dialogue':
      return (
        <BlockShell block={block}>
          <div className="reader-dialogue">
            {block.context && <p className="reader-dialogue__context">{block.context}</p>}
            <div className="reader-dialogue__lines">
              {block.lines.map((line, lineIndex) => (
                <p key={lineIndex} className="reader-dialogue__line">
                  <strong className="reader-dialogue__speaker">{line.speaker}</strong>
                  <span className="reader-dialogue__text">{line.text}</span>
                  {line.note && <span className="reader-dialogue__note">（{line.note}）</span>}
                </p>
              ))}
            </div>
          </div>
        </BlockShell>
      )

    case 'example':
      return (
        <BlockShell block={block}>
          <figure className="reader-example">
            <blockquote className="reader-example__text">{block.text}</blockquote>
            <figcaption className="reader-example__meta">
              {block.translation && (
                <p className="reader-example__translation">{block.translation}</p>
              )}
              {block.note && <p className="reader-example__note">{block.note}</p>}
            </figcaption>
          </figure>
        </BlockShell>
      )

    case 'comparison':
      return (
        <BlockShell block={block}>
          <div className="reader-comparison">
            {block.title && <p className="reader-comparison__title">{block.title}</p>}
            <ul className="reader-comparison__list">
              {block.rows.map((row, rowIndex) => (
                <li key={rowIndex} className="reader-comparison__item">
                  <strong className="reader-comparison__label">{row.label}</strong>
                  <ul className="reader-comparison__points">
                    {row.points.map((point, pointIndex) => (
                      <li key={pointIndex}>{point}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </BlockShell>
      )

    case 'caseStudy':
      return (
        <BlockShell block={block}>
          <article className="reader-casestudy">
            <p className="reader-casestudy__label">{strings.reader.caseStudy}</p>
            {block.title && <p className="reader-casestudy__title">{block.title}</p>}
            <p className="reader-casestudy__scenario">{block.scenario}</p>
            {block.questions && block.questions.length > 0 && (
              <div className="reader-casestudy__questions">
                <p className="reader-casestudy__questions-label">{strings.reader.question}</p>
                <ol>
                  {block.questions.map((question, questionIndex) => (
                    <li key={questionIndex}>{question}</li>
                  ))}
                </ol>
              </div>
            )}
            {block.outcome && (
              <p className="reader-casestudy__outcome">
                <strong>{strings.reader.outcome}: </strong>
                {block.outcome}
              </p>
            )}
          </article>
        </BlockShell>
      )

    case 'doDont':
      return (
        <BlockShell block={block}>
          <div className="reader-dodont">
            {block.title && <p className="reader-dodont__title">{block.title}</p>}
            <div className="reader-dodont__lists">
              <div className="reader-dodont__group reader-dodont__group--do">
                <p className="reader-dodont__label">{strings.reader.doLabel}</p>
                <ul className="reader-dodont__items">
                  {block.do.map((item, itemIndex) => (
                    <li key={itemIndex} className="reader-dodont__item">
                      <span className="reader-dodont__mark" aria-hidden="true">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="reader-dodont__group reader-dodont__group--dont">
                <p className="reader-dodont__label">{strings.reader.dontLabel}</p>
                <ul className="reader-dodont__items">
                  {block.dont.map((item, itemIndex) => (
                    <li key={itemIndex} className="reader-dodont__item">
                      <span className="reader-dodont__mark" aria-hidden="true">
                        ✕
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </BlockShell>
      )

    case 'exercise':
      return (
        <BlockShell block={block}>
          <ExerciseView block={block} />
        </BlockShell>
      )

    case 'authorNote':
      return (
        <BlockShell block={block}>
          <aside className="reader-authornote">
            <p className="reader-authornote__label">{strings.reader.authorNote}</p>
            {block.title && <p className="reader-authornote__title">{block.title}</p>}
            <p className="reader-authornote__text">{block.text}</p>
            {block.author && <p className="reader-authornote__author">{block.author}</p>}
          </aside>
        </BlockShell>
      )

    default: {
      // Forward compatibility: an unknown block type (newer schema than this
      // reader) degrades to nothing rather than rendering a broken state.
      return null
    }
  }
}
