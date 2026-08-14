import { useStrings } from '../i18n/strings'

/** Thin fixed progress line bound to the semantic reading anchor (0–100). */
export function ReaderProgress({ percent }: { percent: number }) {
  const strings = useStrings()
  const value = Math.round(Math.min(1, Math.max(0, percent)) * 100)

  return (
    <div
      className="reader-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={strings.reader.progressLabel}
    >
      <div className="reader-progress__bar" style={{ width: `${value}%` }} />
    </div>
  )
}
