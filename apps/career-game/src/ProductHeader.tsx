import type { MouseEventHandler, ReactNode } from 'react'
import { libraryHomeHref } from './library-links'

export function ProductHeader({
  account,
  libraryOriginValue,
  onLibraryClick,
}: {
  account?: ReactNode
  libraryOriginValue: unknown
  onLibraryClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  return (
    <header className="career-game-header">
      <div className="career-game-brand">
        <span className="career-game-brand__product" lang="en">
          Career Game
        </span>
        <span className="career-game-brand__platform">Business Japanese Hub</span>
      </div>
      <div className="career-game-header__actions">
        <nav className="product-switch" aria-label="プロダクト">
          <a
            href={libraryHomeHref(libraryOriginValue)}
            onClick={onLibraryClick}
            onAuxClick={onLibraryClick}
          >
            <span lang="en">Library</span>
            <span className="product-switch__context">読む・調べる</span>
          </a>
        </nav>
        {account}
      </div>
    </header>
  )
}
