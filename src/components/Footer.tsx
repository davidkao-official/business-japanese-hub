import { useStrings } from '../i18n/strings'

export function Footer() {
  const strings = useStrings()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p>{strings.footer.note}</p>
      </div>
    </footer>
  )
}
