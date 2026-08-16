/**
 * Versioned legal documents (issue #25, B1) — DRAFT placeholder content.
 *
 * The body text is STRUCTURE-ONLY draft placeholder reflecting the required
 * clauses of docs/legal-tax-launch-brief.md §4.1 / §5 (price / payment /
 * delivery / refund-returns, seller-disclosure fields, contact window). Every
 * document ends with a localized draft-status note. This is NOT final binding
 * legal text — the actual text is gated on professional legal review (§8).
 */

import type { LegalDocument } from './model'

export const TERMS_DOCUMENT: LegalDocument = {
  id: 'terms',
  slug: 'terms',
  version: 'v1',
  status: 'draft',
  revisedAt: '2026-08-16',
  titles: {
    ja: '利用規約',
    en: 'Terms of Service',
    'zh-TW': '服務條款',
  },
  bodies: {
    ja: [
      {
        heading: '本規約の適用',
        paragraphs: [
          '本利用規約は、本サイト上で提供されるデジタルコンテンツ（電子書籍等）の購入・閲覧に際して適用される条件を定めるものです。本サイトを利用することで、本規約に同意したものとみなされます。',
        ],
      },
      {
        heading: 'サービスの提供・利用許諾',
        paragraphs: [
          '購入者は、購入したコンテンツを個人的・非商業的な目的で閲覧する非独占的な権利を取得します。コンテンツの複製・再配布・転売は禁止されます。',
        ],
      },
      {
        heading: '価格・支払',
        paragraphs: [
          '販売価格は購入時点で表示される金額が適用されます。支払いは提携する決済事業者を通じて行われ、金額はサーバー側で確定されます（購入者側から金額を指定することはできません）。',
        ],
      },
      {
        heading: 'コンテンツの引渡し',
        paragraphs: [
          'デジタルコンテンツは、購入処理が正常に完了した後、即時にライブラリへ追加され閲覧可能となります。物理的な送付はありません。',
        ],
      },
      {
        heading: '返品・返金',
        paragraphs: [
          'デジタルコンテンツの性質上、瑕疵（不具合）がある場合を除き、購入後の返品・返金は原則として受け付けておりません。台湾消費者保護法に基づく7日間のクーリング・オフは、デジタルコンテンツの即時提供に対する事前同意が得られた場合、適用が除外されることがあります（同意の取得は購入フロー内で行います）。詳細は返品・返金ポリシーをご覧ください。',
        ],
      },
      {
        heading: '免責・責任制限',
        paragraphs: [
          '当サイトは、提供するコンテンツの完全性・正確性について保証するものではありません。法律で認められる範囲内で、コンテンツの利用により生じた損害に対する責任の範囲を制限します。',
        ],
      },
      {
        heading: 'お問い合わせ窓口',
        paragraphs: [
          '本規約に関するお問い合わせは、以下の窓口までご連絡ください。お問い合わせ窓口（メールアドレス）は準備中です。',
        ],
      },
      {
        heading: 'ドラフト注記・法律審査前',
        paragraphs: [
          '本ページはドラフトです。法律専門家による審査前であり、内容は変更される可能性があります。',
        ],
      },
    ],
    en: [
      {
        heading: 'Applicability',
        paragraphs: [
          'These Terms of Service govern the purchase and viewing of digital content (e-books and similar) offered on this site. By using this site you agree to these terms.',
        ],
      },
      {
        heading: 'Service and license',
        paragraphs: [
          'Purchasers receive a non-exclusive right to view purchased content for personal, non-commercial purposes. Copying, redistribution, and resale of content are prohibited.',
        ],
      },
      {
        heading: 'Price and payment',
        paragraphs: [
          'The price shown at the time of purchase applies. Payment is processed through partner payment providers and the amount is determined server-side (you cannot specify an amount yourself).',
        ],
      },
      {
        heading: 'Delivery of content',
        paragraphs: [
          'Digital content is added to your library and viewable immediately after payment completes successfully. No physical delivery is involved.',
        ],
      },
      {
        heading: 'Returns and refunds',
        paragraphs: [
          'Due to the nature of digital content, returns and refunds after purchase are generally not accepted except in the case of defects. The 7-day cooling-off period under Taiwan’s Consumer Protection Act may be excluded where prior consent to immediate delivery of the digital content has been obtained (consent is collected in the purchase flow). See the Returns & Refunds Policy for details.',
        ],
      },
      {
        heading: 'Disclaimer and limitation of liability',
        paragraphs: [
          'This site does not warrant the completeness or accuracy of the content it provides. To the extent permitted by law, our liability for damages arising from use of the content is limited.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          'For questions about these terms, contact us through the support window below. The support email address is pending.',
        ],
      },
      {
        heading: 'Draft note — before legal review',
        paragraphs: [
          'This page is a draft and has not yet been reviewed by legal counsel; content may change.',
        ],
      },
    ],
    'zh-TW': [
      {
        heading: '本條款的適用',
        paragraphs: [
          '本服務條款規範於本網站購買與瀏覽數位內容（電子書等）的條件。使用本網站即視為同意本條款。',
        ],
      },
      {
        heading: '服務提供與授權',
        paragraphs: [
          '購買者取得在個人、非商業目的下瀏覽所購內容之非專屬權利。禁止複製、再散布或轉售內容。',
        ],
      },
      {
        heading: '價格與付款',
        paragraphs: [
          '以購買時顯示之價格為準。付款經由合作之金流業者處理，金額由伺服器端確定（無法由購買者自行指定金額）。',
        ],
      },
      {
        heading: '內容交付',
        paragraphs: [
          '數位內容於付款完成後即時加入您的書庫並可供瀏覽。無實體寄送。',
        ],
      },
      {
        heading: '退貨與退款',
        paragraphs: [
          '基於數位內容之性質，除瑕疵情形外，購買後原則上不接受退貨退款。若已於購買流程中取得「事先同意立即提供數位內容」，依台灣消費者保護法第 19 條之 7 日解除權可能不適用。詳見退款政策。',
        ],
      },
      {
        heading: '免責聲明與責任限制',
        paragraphs: [
          '本網站不保證所提供內容之完整性與正確性。在法律允許之範圍內，就使用內容所生損害之賠償責任予以限制。',
        ],
      },
      {
        heading: '聯絡窗口',
        paragraphs: [
          '如對本條款有任何疑問，請透過下列窗口與我們聯絡。客服信箱尚待確認。',
        ],
      },
      {
        heading: '草稿註記・法律審閱前',
        paragraphs: [
          '本頁內容為草稿，尚未經法律專業審閱，內容可能變更。',
        ],
      },
    ],
  },
}

export const PRIVACY_DOCUMENT: LegalDocument = {
  id: 'privacy',
  slug: 'privacy',
  version: 'v1',
  status: 'draft',
  revisedAt: '2026-08-16',
  titles: {
    ja: 'プライバシーポリシー',
    en: 'Privacy Policy',
    'zh-TW': '隱私權政策',
  },
  bodies: {
    ja: [
      {
        heading: '収集する情報',
        paragraphs: [
          '本サイトは、購入処理、アカウント管理、カスタマーサポートのために必要な範囲で個人情報（氏名、連絡先、購入履歴等）を収集します。',
        ],
      },
      {
        heading: '利用目的',
        paragraphs: [
          '収集した個人情報は、注文の処理・配信、カスタマーサポート、法令対応などの目的にのみ利用します。',
        ],
      },
      {
        heading: '第三者提供・外部サービス',
        paragraphs: [
          '決済処理は提携する決済事業者に委託するため、決済に必要な範囲で情報を共有することがあります。その他の第三者への提供は、法令に基づく場合を除き行いません。',
        ],
      },
      {
        heading: '保存期間・データ管理',
        paragraphs: [
          '個人情報は利用目的の達成に必要な期間保存し、適切に管理します。保有期間の詳細は法律専門家による確認後に明示します。',
        ],
      },
      {
        heading: 'お問い合わせ・苦情窓口',
        paragraphs: [
          '個人情報の取扱いに関するお問い合わせ・苦情は、以下の窓口までご連絡ください。お問い合わせ窓口（メールアドレス）は準備中です。',
        ],
      },
      {
        heading: 'ドラフト注記・法律審査前',
        paragraphs: [
          '本ページはドラフトです。法律専門家による審査前であり、内容は変更される可能性があります。',
        ],
      },
    ],
    en: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'This site collects personal information (name, contact details, purchase history, and similar) to the extent necessary for purchase processing, account management, and customer support.',
        ],
      },
      {
        heading: 'Purposes of processing',
        paragraphs: [
          'Personal information is used only for order processing and delivery, customer support, and legal compliance.',
        ],
      },
      {
        heading: 'Third parties and external services',
        paragraphs: [
          'Payment processing is delegated to partner payment providers, so information may be shared to the extent required for payment. No other disclosure to third parties occurs except as required by law.',
        ],
      },
      {
        heading: 'Retention and data management',
        paragraphs: [
          'Personal information is retained for as long as needed to fulfill its purposes and managed appropriately. Exact retention periods will be published after confirmation with legal counsel.',
        ],
      },
      {
        heading: 'Contact and complaints',
        paragraphs: [
          'For questions or complaints about the handling of personal information, contact us through the support window below. The support email address is pending.',
        ],
      },
      {
        heading: 'Draft note — before legal review',
        paragraphs: [
          'This page is a draft and has not yet been reviewed by legal counsel; content may change.',
        ],
      },
    ],
    'zh-TW': [
      {
        heading: '我們收集的資訊',
        paragraphs: [
          '本網站於購買處理、帳戶管理與客戶支援所需範圍內收集個人資料（姓名、聯絡方式、購買紀錄等）。',
        ],
      },
      {
        heading: '利用目的',
        paragraphs: [
          '所收集之個人資料僅用於訂單處理與交付、客戶支援及法令遵循等目的。',
        ],
      },
      {
        heading: '第三方與外部服務',
        paragraphs: [
          '付款處理委由合作之金流業者辦理，故於付款所需範圍內可能分享相關資訊。除法律要求外，不對其他第三方提供個人資料。',
        ],
      },
      {
        heading: '保存期間與資料管理',
        paragraphs: [
          '個人資料於達成利用目的所需期間內保存並妥善管理。確切保存期間將於法律專業確認後公布。',
        ],
      },
      {
        heading: '聯絡與申訴窗口',
        paragraphs: [
          '如對個人資料之處理有任何疑問或申訴，請透過下列窗口與我們聯絡。客服信箱尚待確認。',
        ],
      },
      {
        heading: '草稿註記・法律審閱前',
        paragraphs: [
          '本頁內容為草稿，尚未經法律專業審閱，內容可能變更。',
        ],
      },
    ],
  },
}

export const TOKUSHOHO_DOCUMENT: LegalDocument = {
  id: 'tokushoho',
  slug: 'tokushoho',
  version: 'v1',
  status: 'draft',
  revisedAt: '2026-08-16',
  titles: {
    ja: '特定商取引法に基づく表記',
    en: 'Notice under the Act on Specified Commercial Transactions',
    'zh-TW': '特定商交易法標示',
  },
  bodies: {
    ja: [
      {
        id: 'jp-tokushoho-seller-disclosure',
        heading: '販売者',
        paragraphs: [
          '販売者名：販売者名確認中（登録名は確定次第表示します）。住所・電話番号・通信販売業務責任者名は確認中です。',
        ],
      },
      {
        heading: '販売価格・送料',
        paragraphs: [
          '販売価格は各コンテンツの購入ページに税込表示します（消費税の適用状況は法改正・課税事業者の判定に基づき表示します）。デジタルコンテンツのため送料はかかりません。',
        ],
      },
      {
        heading: '支払方法・支払時期',
        paragraphs: [
          '支払方法・支払時期は購入時に選択・表示される決済事業者の条件に従います。支払いの確認後にコンテンツが提供されます。',
        ],
      },
      {
        heading: '商品引渡時期',
        paragraphs: [
          'デジタルコンテンツは、購入処理が正常に完了した後、即時にライブラリへ追加され閲覧可能となります。',
        ],
      },
      {
        heading: '返品・交換',
        paragraphs: [
          'デジタルコンテンツの性質上、瑕疵（不具合）がある場合を除き、返品・返金は原則として受け付けておりません。',
        ],
      },
      {
        heading: 'お問い合わせ窓口',
        paragraphs: [
          '商品・注文・返品に関するお問い合わせは、以下の窓口までご連絡ください。お問い合わせ窓口（メールアドレス）は準備中です。',
        ],
      },
      {
        heading: 'ドラフト注記・法律審査前',
        paragraphs: [
          '本ページはドラフトです。法律専門家による審査前であり、販売者情報・内容は変更される可能性があります。',
        ],
      },
    ],
    en: [
      {
        heading: 'Seller',
        paragraphs: [
          'Seller name: pending confirmation (the registered name will be displayed once confirmed). Address, phone number, and the person responsible for mail-order business are pending.',
        ],
      },
      {
        heading: 'Price and shipping',
        paragraphs: [
          'Prices are shown tax-inclusive on each purchase page (consumption-tax applicability is displayed based on current law and taxable-entity status). No shipping fee applies to digital content.',
        ],
      },
      {
        heading: 'Payment methods and timing',
        paragraphs: [
          'Payment methods and timing follow the terms of the payment provider selected and displayed at purchase. Content is provided after payment is confirmed.',
        ],
      },
      {
        heading: 'Delivery timing',
        paragraphs: [
          'Digital content is added to your library and viewable immediately after purchase processing completes.',
        ],
      },
      {
        heading: 'Returns and exchanges',
        paragraphs: [
          'Due to the nature of digital content, returns and refunds after purchase are generally not accepted except in the case of defects.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          'For questions about products, orders, or returns, contact us through the support window below. The support email address is pending.',
        ],
      },
      {
        heading: 'Draft note — before legal review',
        paragraphs: [
          'This page is a draft and has not yet been reviewed by legal counsel; seller information and content may change.',
        ],
      },
    ],
    'zh-TW': [
      {
        heading: '販售者',
        paragraphs: [
          '販售者名稱：待確認（註冊名稱確定後顯示）。地址、電話號碼與通信販賣業務負責人尚待確認。',
        ],
      },
      {
        heading: '販售價格與運費',
        paragraphs: [
          '各內容之購買頁顯示含稅價格（消費稅適用情形依現行法令與課稅事業者判定顯示）。數位內容無運費。',
        ],
      },
      {
        heading: '付款方式與付款時期',
        paragraphs: [
          '付款方式與時期依購買時選擇並顯示之金流業者條件為準。付款確認後提供內容。',
        ],
      },
      {
        heading: '商品交付時期',
        paragraphs: [
          '數位內容於購買處理完成後即時加入您的書庫並可供瀏覽。',
        ],
      },
      {
        heading: '退貨與換貨',
        paragraphs: [
          '基於數位內容之性質，除瑕疵情形外，購買後原則上不接受退貨退款。',
        ],
      },
      {
        heading: '聯絡窗口',
        paragraphs: [
          '如對商品、訂單或退貨有任何疑問，請透過下列窗口與我們聯絡。客服信箱尚待確認。',
        ],
      },
      {
        heading: '草稿註記・法律審閱前',
        paragraphs: [
          '本頁內容為草稿，尚未經法律專業審閱，販售者資訊與內容可能變更。',
        ],
      },
    ],
  },
}

export const REFUNDS_DOCUMENT: LegalDocument = {
  id: 'refunds',
  slug: 'refunds',
  version: 'v1',
  status: 'draft',
  revisedAt: '2026-08-16',
  titles: {
    ja: '返品・返金ポリシー',
    en: 'Returns & Refunds Policy',
    'zh-TW': '退款政策',
  },
  bodies: {
    ja: [
      {
        id: 'jp-refunds-acknowledgement',
        heading: '返品・返金の基本方針',
        paragraphs: [
          'デジタルコンテンツの性質上、購入後の返品・返金は、瑕疵（不具合）がある場合を除き、原則として受け付けておりません。',
        ],
      },
      {
        heading: '台湾消費者保護法・7日間クーリング・オフ',
        paragraphs: [
          '台湾消費者保護法に基づく7日間のクーリング・オフは、デジタルコンテンツの即時提供に対して購入前に事前同意が得られた場合、適用が除外されることがあります。本サイトでは購入フロー内でこの事前同意を取得します（同意の仕組みは購入機能の実装に含まれます）。',
        ],
      },
      {
        heading: '返金の手続き',
        paragraphs: [
          '返金をご希望の場合は、下記のお問い合わせ窓口までご連絡ください。返金の対象・時期・手続きの詳細は、法律専門家による確認後に明示します。',
        ],
      },
      {
        heading: '瑕疵（不具合）への対応',
        paragraphs: [
          '購入したコンテンツに瑕疵（表示不具合・アクセス不能等）がある場合、お問い合わせ窓口までご連絡ください。状況を確認の上、修正または適切な対応を行います。',
        ],
      },
      {
        heading: 'お問い合わせ窓口',
        paragraphs: [
          '返品・返金に関するお問い合わせは、以下の窓口までご連絡ください。お問い合わせ窓口（メールアドレス）は準備中です。',
        ],
      },
      {
        heading: 'ドラフト注記・法律審査前',
        paragraphs: [
          '本ページはドラフトです。法律専門家による審査前であり、内容は変更される可能性があります。',
        ],
      },
    ],
    en: [
      {
        heading: 'General policy',
        paragraphs: [
          'Due to the nature of digital content, returns and refunds after purchase are generally not accepted except in the case of defects.',
        ],
      },
      {
        heading: 'Taiwan Consumer Protection Act and the 7-day cooling-off period',
        paragraphs: [
          'The 7-day cooling-off period under Taiwan’s Consumer Protection Act may be excluded where prior consent to the immediate provision of the digital content has been obtained before purchase. This site collects that consent within the purchase flow (the consent mechanism is part of the purchase feature implementation).',
        ],
      },
      {
        heading: 'How to request a refund',
        paragraphs: [
          'To request a refund, contact the support window below. The scope, timing, and procedure of refunds will be published after confirmation with legal counsel.',
        ],
      },
      {
        heading: 'Dealing with defects',
        paragraphs: [
          'If purchased content has a defect (display issue, access failure, etc.), contact the support window below. After verifying the situation, we will correct it or respond appropriately.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          'For questions about returns and refunds, contact us through the support window below. The support email address is pending.',
        ],
      },
      {
        heading: 'Draft note — before legal review',
        paragraphs: [
          'This page is a draft and has not yet been reviewed by legal counsel; content may change.',
        ],
      },
    ],
    'zh-TW': [
      {
        heading: '退貨退款基本方針',
        paragraphs: [
          '基於數位內容之性質，除瑕疵情形外，購買後原則上不接受退貨退款。',
        ],
      },
      {
        id: 'tw-withdrawal-notice',
        heading: '台灣消費者保護法與 7 日解除權',
        paragraphs: [
          '若已於購買前取得「事先同意立即提供數位內容」，依台灣消費者保護法第 19 條之 7 日解除權可能不適用。本網站於購買流程中取得此項同意（同意機制屬購買功能之實作範圍）。',
        ],
      },
      {
        id: 'tw-immediate-delivery-consent',
        heading: '數位內容即時提供之事先同意',
        paragraphs: ['本人同意立即提供／下載數位內容。'],
      },
      {
        heading: '退款申請程序',
        paragraphs: [
          '如欲申請退款，請與下列窗口聯絡。退款之範圍、時點與程序將於法律專業確認後公布。',
        ],
      },
      {
        heading: '瑕疵處理',
        paragraphs: [
          '若所購內容有瑕疵（顯示異常、無法存取等），請與下列窗口聯絡。我們將於確認情形後進行修正或適當處理。',
        ],
      },
      {
        heading: '聯絡窗口',
        paragraphs: [
          '如對退貨退款有任何疑問，請透過下列窗口與我們聯絡。客服信箱尚待確認。',
        ],
      },
      {
        heading: '草稿註記・法律審閱前',
        paragraphs: [
          '本頁內容為草稿，尚未經法律專業審閱，內容可能變更。',
        ],
      },
    ],
  },
}

/** All versioned legal documents, in display order. */
export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  TERMS_DOCUMENT,
  PRIVACY_DOCUMENT,
  TOKUSHOHO_DOCUMENT,
  REFUNDS_DOCUMENT,
]
