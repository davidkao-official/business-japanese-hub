import { useAppearance } from '../lib/appearance/AppearanceContext'
import { useStrings } from '../i18n/strings'
import type { AppearancePreference } from '../lib/appearance/appearance'

/**
 * Application-wide appearance control: exactly three preferences
 * (System / Light / Dark). A native radio group gives arrow-key navigation
 * and programmatic selection for free; the visible pills are labels.
 */
export function AppearanceControl() {
  const strings = useStrings()
  const { preference, setPreference } = useAppearance()

  const options: ReadonlyArray<{ value: AppearancePreference; label: string }> = [
    { value: 'system', label: strings.appearance.system },
    { value: 'light', label: strings.appearance.light },
    { value: 'dark', label: strings.appearance.dark },
  ]

  return (
    <div role="radiogroup" aria-label={strings.appearance.label} className="appearance-control">
      {options.map((option) => (
        <label
          key={option.value}
          className={`appearance-control__option${
            preference === option.value ? ' appearance-control__option--active' : ''
          }`}
        >
          <input
            type="radio"
            name="appearance"
            value={option.value}
            checked={preference === option.value}
            onChange={() => setPreference(option.value)}
            className="appearance-control__input"
          />
          <span className="appearance-control__label">{option.label}</span>
        </label>
      ))}
    </div>
  )
}
