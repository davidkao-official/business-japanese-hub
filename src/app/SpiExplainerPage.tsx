import { useStrings, getActiveLocale } from '../i18n/strings'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const SECTION_KEYS = ["spiText02","spiText03","spiText04","spiText05","spiText06","spiText07","spiText08","spiText09","spiText10","spiText11","spiText12","spiText13","spiText14","spiText15","spiText16","spiText17","spiText18"] as const

function Section({ index, children }: { index: number; children: ReactNode }) {
  const ui = useStrings().learningUi
  const title = ui[SECTION_KEYS[index]!]
  return (
    <section className="spi-explainer__section" aria-labelledby={`spi-${index}`}>
      <h2 id={`spi-${index}`}>{title}</h2>
      {children}
    </section>
  )
}

function DavidCallout({ accessibleName, children }: { accessibleName: string; children: ReactNode }) {
  const ui = useStrings().learningUi

  return (
    <aside className="spi-explainer__david" aria-label={accessibleName}>
      <p className="spi-explainer__label">{ui.spiText19}</p>
      {children}
    </aside>
  )
}

/** Keeps the SPI explainer route description scoped to its mounted route lifetime. */
function useSpiExplainerDescription(): void {
  const descriptionText = useStrings().learningUi.spiText01
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const description = existing ?? document.createElement('meta')
    const created = existing === null
    if (created) {
      description.name = 'description'
      document.head.append(description)
    }
    const previous = description.content
    description.content = descriptionText
    return () => {
      if (created) description.remove()
      else description.content = previous
    }
  }, [descriptionText])
}

export function SpiExplainerPage() {
  const ui = useStrings().learningUi

  useDocumentTitle(ui.spiText20)
  useSpiExplainerDescription()

  return (
    <article className="spi-explainer" lang={getActiveLocale()} aria-labelledby="spi-explainer-title">
      <header className="spi-explainer__hero">
        <p className="spi-explainer__eyebrow" lang={getActiveLocale()}>{ui.spiText21}</p>
        <h1 id="spi-explainer-title">{ui.spiText22}</h1>
        <p className="spi-explainer__dek">{ui.spiText23}</p>
        <p>{ui.spiText24}</p>
        <DavidCallout accessibleName={ui.spiText25}>
          <p>{ui.spiText26}</p>
          <p>{ui.spiText27}<strong>{ui.spiText28}</strong></p>
        </DavidCallout>
        <p>{ui.spiText29}</p>
      </header>

      <aside className="spi-explainer__source-note">
        <strong>{ui.spiText30}</strong>
        <span>{ui.spiText31}</span>
      </aside>

      <div className="spi-explainer__sections">
        <Section index={0}>
          <p>{ui.spiText32}</p>
        </Section>

        <Section index={1}>
          <p>{ui.spiText33}</p>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>{ui.spiText34}</th><th>{ui.spiText35}</th></tr></thead><tbody><tr><th scope="row">{ui.spiText36}</th><td>{ui.spiText37}</td></tr><tr><th scope="row">{ui.spiText38}</th><td>{ui.spiText39}</td></tr></tbody></table></div>
        </Section>

        <Section index={2}>
          <p>{ui.spiText40}</p>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>{ui.spiText41}</th><th>{ui.spiText42}</th><th>{ui.spiText43}</th></tr></thead><tbody><tr><th scope="row">SPI-U</th><td>{ui.spiText44}</td><td>{ui.spiText45}</td></tr><tr><th scope="row">SPI-G</th><td>{ui.spiText46}</td><td>{ui.spiText45}</td></tr><tr><th scope="row">SPI-H</th><td>{ui.spiText47}</td><td>{ui.spiText45}</td></tr></tbody></table></div>
          <p className="spi-explainer__warning">{ui.spiText48}</p>
        </Section>

        <Section index={3}>
          <p>{ui.spiText49}</p>
          <ul className="spi-explainer__chips"><li>{ui.spiText50}</li><li>{ui.spiText51}</li><li>{ui.spiText52}</li><li>{ui.spiText53}</li></ul>
        </Section>

        <Section index={4}>
          <div className="spi-explainer__table-wrap">
            <table>
              <caption>{ui.spiText54}</caption>
              <thead><tr><th scope="col">{ui.spiText55}</th><th scope="col">{ui.spiText56}</th></tr></thead>
              <tbody>
                <tr><th scope="row">{ui.spiText38}</th><td>{ui.spiText57}</td></tr>
                <tr><th scope="row">{ui.spiText36}</th><td>{ui.spiText58}</td></tr>
                <tr><th scope="row">{ui.spiText59}</th><td>{ui.spiText60}</td></tr>
                <tr><th scope="row">{ui.spiText61}</th><td>{ui.spiText62}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="spi-explainer__source">{ui.spiText63}</p>
        </Section>

        <Section index={5}>
          <p>{ui.spiText64}</p>
        </Section>

        <Section index={6}>
          <div className="spi-explainer__table-wrap"><table><thead><tr><th>JLPT</th><th>SPI</th></tr></thead><tbody><tr><td>{ui.spiText65}</td><td>{ui.spiText66}</td></tr><tr><td>{ui.spiText67}</td><td>{ui.spiText68}</td></tr></tbody></table></div>
          <p className="spi-explainer__pullquote">{ui.spiText69}</p>
        </Section>

        <Section index={7}>
          <p>{ui.spiText70}</p>
          <p>{ui.spiText71}<strong>{ui.spiText72}</strong></p>
        </Section>

        <Section index={8}>
          <div className="spi-explainer__translation"><p><strong>{ui.spiText73}</strong><br />{ui.spiText74}</p><p><strong>{ui.spiText75}</strong><br />{ui.spiText76}</p></div>
          <p>{ui.spiText77}</p>
        </Section>

        <Section index={9}>
          <p>{ui.spiText78}</p>
        </Section>

        <Section index={10}>
          <p>{ui.spiText79}</p>
        </Section>

        <Section index={11}>
          <p>{ui.spiText80}</p>
          <DavidCallout accessibleName={ui.spiText81}>
            <p>{ui.spiText82}</p>
            <p>{ui.spiText83}<strong>{ui.spiText84}</strong></p>
          </DavidCallout>
        </Section>

        <Section index={12}>
          <p>{ui.spiText85}</p>
        </Section>

        <Section index={13}>
          <p>{ui.spiText86}</p>
        </Section>

        <Section index={14}>
          <p>{ui.spiText87}</p>
          <ul className="spi-explainer__chips"><li>SPI</li><li>玉手箱</li><li>TG-WEB</li><li>CAB</li><li>GAB</li></ul>
        </Section>

        <Section index={15}>
          <p>{ui.spiText88}</p>
          <ul className="spi-explainer__skills"><li>{ui.spiText89}</li><li>{ui.spiText90}</li><li>{ui.spiText91}</li><li>{ui.spiText92}</li></ul>
          <p>{ui.spiText93}</p>
        </Section>

        <Section index={16}>
          <p>{ui.spiText94}<strong>{ui.spiText95}</strong></p>
          <p>{ui.spiText96}</p>
          <p className="spi-explainer__pullquote">{ui.spiText97}</p>
          <p>{ui.spiText98}</p>
          <DavidCallout accessibleName={ui.spiText99}>
            <p>{ui.spiText100}</p>
          </DavidCallout>
          <p className="spi-explainer__closing">{ui.spiText101}</p>
        </Section>
      </div>

      <footer className="spi-explainer__sources" aria-label={ui.spiText102}>
        <h2>{ui.spiText102}</h2>
        <p>{ui.spiText103}</p>
        <ul>
          <li><a href="https://www.spi.recruit.co.jp/" target="_blank" rel="noreferrer">{ui.spiText104}</a></li>
          <li><a href="https://www.spi.recruit.co.jp/spi3/faq/" target="_blank" rel="noreferrer">{ui.spiText105}</a></li>
          <li><a href="https://www.spi.recruit.co.jp/lp/spi_lp01a.html" target="_blank" rel="noreferrer">{ui.spiText106}</a></li>
          <li><a href="https://www.spi.recruit.co.jp/testcenter/" target="_blank" rel="noreferrer">{ui.spiText107}</a></li>
        </ul>
      </footer>

      <footer className="spi-explainer__cta">
        <p className="spi-explainer__label" lang={getActiveLocale()}>{ui.spiText108}</p>
        <h2>{ui.spiText109}</h2>
        <Link className="btn btn--primary" to="/practice/web-test">{ui.webTitle}</Link>
      </footer>
    </article>
  )
}
