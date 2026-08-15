/**
 * PurchaseCTA — the 購入する button, isolated behind the provider-neutral
 * purchase seam (src/lib/purchase). #9 swaps only the executor; this component
 * and its failure feedback are the stable interaction model
 * (docs/ui-ux-research.md §8.3 — "未来 ECPay 应只替换 purchase action backend").
 */

import { useState } from 'react'
import type { Book } from '../content/types'
import { useStrings } from '../i18n/strings'
import { formatPrice } from '../lib/price'
import { usePurchase } from '../lib/purchase/PurchaseContext'

export interface PurchaseCTAProps {
  book: Book
  className?: string
}

export function PurchaseCTA({ book, className = '' }: PurchaseCTAProps) {
  const strings = useStrings()
  const { execute } = usePurchase()
  const [state, setState] = useState<'idle' | 'pending' | 'unavailable'>('idle')

  const onClick = async () => {
    if (state === 'pending') return
    setState('pending')
    try {
      const result = await execute({
        bookId: book.id,
        amount: book.price?.amount,
        currency: book.price?.currency,
      })
      setState(result.ok ? 'idle' : 'unavailable')
    } catch {
      // A future executor is allowed to reject; it must degrade to
      // "unavailable" and never leave the CTA stuck in pending.
      setState('unavailable')
    }
  }

  const priceLabel = book.price ? formatPrice(book.price) : null
  const label = priceLabel ? `${strings.book.purchase}（${priceLabel}）` : strings.book.purchase

  return (
    <span className={`purchase-cta${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="btn btn--primary"
        onClick={onClick}
        disabled={state === 'pending'}
      >
        {state === 'pending' ? strings.book.pending : label}
      </button>
      {state === 'unavailable' && (
        <span className="purchase-cta__note" role="status">
          {strings.book.purchaseUnavailable}
        </span>
      )}
    </span>
  )
}
