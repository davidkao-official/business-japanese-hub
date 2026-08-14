import { useId } from 'react'
import type { ReaderSettings } from './readerSettings'
import { useStrings } from '../i18n/strings'

export interface ReaderSettingsPanelProps {
  settings: ReaderSettings
  onChange: (settings: ReaderSettings) => void
}

/** Reader settings V1: text size / theme / typeface (research §8.2). */
export function ReaderSettingsPanel({ settings, onChange }: ReaderSettingsPanelProps) {
  const strings = useStrings()
  const r = strings.reader
  const fontSizeLabelId = useId()
  const themeLabelId = useId()
  const fontLabelId = useId()

  const fontSizes = [
    { key: 'small' as const, label: r.fontSizeSmall },
    { key: 'standard' as const, label: r.fontSizeStandard },
    { key: 'large' as const, label: r.fontSizeLarge },
    { key: 'xlarge' as const, label: r.fontSizeXLarge },
  ]
  const themes = [
    { key: 'light' as const, label: r.themeLight },
    { key: 'sepia' as const, label: r.themeSepia },
    { key: 'dark' as const, label: r.themeDark },
  ]
  const fonts = [
    { key: 'serif' as const, label: r.fontSerif },
    { key: 'sans' as const, label: r.fontSans },
  ]

  return (
    <div className="reader-settings">
      <section className="reader-settings__group" aria-labelledby={fontSizeLabelId}>
        <h3 className="reader-settings__label" id={fontSizeLabelId}>
          {r.fontSize}
        </h3>
        <div className="reader-settings__options">
          {fontSizes.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`reader-settings__option${
                settings.fontSize === option.key ? ' reader-settings__option--active' : ''
              }`}
              aria-pressed={settings.fontSize === option.key}
              onClick={() => onChange({ ...settings, fontSize: option.key })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="reader-settings__group" aria-labelledby={themeLabelId}>
        <h3 className="reader-settings__label" id={themeLabelId}>
          {r.theme}
        </h3>
        <div className="reader-settings__options">
          {themes.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`reader-settings__option${
                settings.theme === option.key ? ' reader-settings__option--active' : ''
              }`}
              aria-pressed={settings.theme === option.key}
              onClick={() => onChange({ ...settings, theme: option.key })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="reader-settings__group" aria-labelledby={fontLabelId}>
        <h3 className="reader-settings__label" id={fontLabelId}>
          {r.font}
        </h3>
        <div className="reader-settings__options">
          {fonts.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`reader-settings__option${
                settings.font === option.key ? ' reader-settings__option--active' : ''
              }`}
              aria-pressed={settings.font === option.key}
              onClick={() => onChange({ ...settings, font: option.key })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
