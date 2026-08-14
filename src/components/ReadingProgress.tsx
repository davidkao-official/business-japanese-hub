/**
 * ReadingProgress — the quiet in-flow progress line for owned-book surfaces
 * (Library). Thin line + percent, never a completion donut / streak
 * (docs/ui-ux-research.md §4.3).
 */

export interface ReadingProgressProps {
  percent: number
  /** Accessible name, e.g. "読書の進捗". */
  label: string
}

export function ReadingProgress({ percent, label }: ReadingProgressProps) {
  const value = Math.round(Math.min(1, Math.max(0, percent)) * 100)

  return (
    <div
      className="reading-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="reading-progress__bar" style={{ width: `${value}%` }} />
    </div>
  )
}
