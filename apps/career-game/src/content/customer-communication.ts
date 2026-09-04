import {
  CAREER_GAME_SCHEMA_VERSION,
  validateScenario,
  type Scenario,
} from '@business-japanese-hub/career-game'

const authoredScenario = {
  schemaVersion: CAREER_GAME_SCHEMA_VERSION,
  id: 'customer-communication',
  slug: 'customer-communication',
  contentVersion: 1,
  locale: 'ja-JP',
  title: '取引先との一手',
  subtitle: '約束する前に、前提と選択肢をそろえる',
  summary:
    '取引先からの追加要望、迫る納期、進捗報告の訂正、納品後の振り返り。' +
    '相手の期待を守りながら、言いにくい事実と現実的な次の一手を伝える五つのケースファイル。',
  startSceneId: 'customer-scope',
  characters: [
    { id: 'mori-you', name: '森', role: 'アカウント担当（あなた）' },
    { id: 'nishida-client', name: '西田', role: '取引先・業務改善室' },
    { id: 'kawamura-lead', name: '河村', role: '社内開発リーダー' },
    { id: 'sakai-quality', name: '坂井', role: '社内品質担当' },
  ],
  meters: [{ id: 'trust', label: '信頼', min: -5, max: 5, initial: 0 }],
  skillTags: ['request-clarification', 'deadline-negotiation', 'error-reporting'],
  libraryLinks: [
    { bookId: 'book-sample-bj-email', chapterId: 'bm-ch-3' },
    { bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' },
  ],
  scenes: [
    {
      id: 'customer-scope',
      kind: 'decision',
      title: '可否を返す前に前提をそろえる',
      context: '火曜日 10:20｜取引先とのオンライン定例',
      narrative:
        '西田さんから、営業担当向けのCSV出力を次回リリースに追加できないか相談された。' +
        '今日中に可否だけでも知りたいというが、対象ユーザー、出力項目、受け入れ条件はまだ決まっていない。',
      dialogue: [
        {
          characterId: 'nishida-client',
          text: '来週月曜のリリースに、営業向けのCSV出力も間に合わせていただけますか。今日中に可否だけいただけると助かります。',
        },
      ],
      prompt: '約束する前に、どのように返す？',
      choices: [
        {
          id: 'customer-scope-confirm-choice',
          label: '対象範囲と受け入れ条件を確認してから可否を返す',
          outcomeId: 'customer-scope-confirm-outcome',
        },
        {
          id: 'customer-scope-assume-choice',
          label: '「確認して折り返します」とだけ伝え、社内で想定して進める',
          outcomeId: 'customer-scope-assume-outcome',
        },
        {
          id: 'customer-scope-promise-choice',
          label: '「問題ありません」と即答し、細部は後で詰める',
          outcomeId: 'customer-scope-promise-outcome',
        },
      ],
    },
    {
      id: 'customer-risk',
      kind: 'decision',
      title: '納期リスクを先に共有する',
      context: '火曜日 15:40｜社内の見積もり確認',
      narrative:
        '取引先への最初の返答を終えて社内で確認すると、CSVに必要なデータソースの準備と権限テストに想定以上の時間がかかることが分かった。' +
        '全範囲を月曜に出すにはリスクがあり、先方に伝えた内容を根拠付きで見直す必要がある。',
      dialogue: [
        {
          characterId: 'kawamura-lead',
          text: '仕様を詰めると、月曜までの実装はかなり際どい。先方には最初の返答をしているので、伝えた内容をどう見直して説明するか決めよう。',
        },
      ],
      prompt: '見通しが変わった時点で、何をする？',
      choices: [
        {
          id: 'customer-risk-share-choice',
          label: '事実・影響・選択肢を整理し、今日中にリスクを共有する',
          outcomeId: 'customer-risk-share-outcome',
        },
        {
          id: 'customer-risk-wait-choice',
          label: '確定するまで社内で調整し、返答を明日まで待つ',
          outcomeId: 'customer-risk-wait-outcome',
        },
        {
          id: 'customer-risk-hide-choice',
          label: '「間に合うよう進めます」と先に回答し、遅れは確定してから伝える',
          outcomeId: 'customer-risk-hide-outcome',
        },
      ],
    },
    {
      id: 'customer-priority',
      kind: 'decision',
      title: '納期の希望を現実的な案に変える',
      context: '水曜日 11:00｜取引先からの緊急電話',
      narrative:
        '西田さんは月曜の営業会議で使いたいので、全項目をどうしても間に合わせたいと言う。' +
        '社内では、最小限の項目なら月曜に検証まで終えられる見込みだが、全項目の品質を同時に保証するのは難しい。',
      dialogue: [
        {
          characterId: 'nishida-client',
          text: '月曜の会議で使えないと困るので、何とか全項目をお願いします。多少のことならこちらで確認します。',
        },
      ],
      prompt: '相手の目的を尊重しつつ、どの提案をする？',
      choices: [
        {
          id: 'customer-priority-slice-choice',
          label: '月曜に必要な最小範囲と検証方法を確認し、段階納品を提案する',
          outcomeId: 'customer-priority-slice-outcome',
        },
        {
          id: 'customer-priority-best-effort-choice',
          label: '「できる限り対応します」と返し、社内で何とかする',
          outcomeId: 'customer-priority-best-effort-outcome',
        },
        {
          id: 'customer-priority-refuse-choice',
          label: '契約上無理だとだけ伝え、相手の計画の問題として退ける',
          outcomeId: 'customer-priority-refuse-outcome',
        },
      ],
    },
    {
      id: 'customer-correction',
      kind: 'decision',
      title: '進捗報告の誤りを訂正する',
      context: '水曜日 17:20｜進捗メール送信後',
      narrative:
        '先ほど送った進捗報告に「権限テスト完了」と記載したが、実際には一つの権限パターンが未確認だった。' +
        '坂井さんから誤りを指摘された。取引先はその報告をもとに月曜の利用を想定している。',
      dialogue: [
        {
          characterId: 'sakai-quality',
          text: '進捗メールのテスト結果ですが、管理者以外の権限がまだ一件未確認です。先方への訂正はどうしますか。',
        },
      ],
      prompt: '最初の訂正連絡に何を含める？',
      choices: [
        {
          id: 'customer-correction-facts-choice',
          label: '誤り・影響範囲・正しい状況・次の更新時刻をすぐ伝える',
          outcomeId: 'customer-correction-facts-outcome',
        },
        {
          id: 'customer-correction-apology-choice',
          label: '「申し訳ありません」と謝罪だけ先に送り、詳細は後から伝える',
          outcomeId: 'customer-correction-apology-outcome',
        },
        {
          id: 'customer-correction-silent-choice',
          label: '記載を直したメールを送り、聞かれるまで訂正を説明しない',
          outcomeId: 'customer-correction-silent-outcome',
        },
      ],
    },
    {
      id: 'customer-closeout',
      kind: 'decision',
      title: '納品後の振り返りを次の信頼につなげる',
      context: '金曜日 16:30｜納品後の振り返り',
      narrative:
        '最小範囲の機能は月曜に無事使われ、残りの項目も金曜に納品できた。' +
        '西田さんは、今回の見通し違いがなぜ起きたのか、次回はいつ何を確認できるのかを知りたいと言っている。',
      dialogue: [
        {
          characterId: 'nishida-client',
          text: '今回は助かりました。次に同じことが起きないよう、原因と今後の確認タイミングを共有いただけますか。',
        },
      ],
      prompt: '振り返りの場で、どのように締める？',
      choices: [
        {
          id: 'customer-closeout-facts-choice',
          label: '確認済みの事実・暫定対策・担当者・次回更新時刻を分けて共有する',
          outcomeId: 'customer-closeout-facts-outcome',
        },
        {
          id: 'customer-closeout-apology-choice',
          label: '原因は断定せず、「ご迷惑をおかけしました」と謝罪を重ねる',
          outcomeId: 'customer-closeout-apology-outcome',
        },
        {
          id: 'customer-closeout-blame-choice',
          label: '要件が曖昧だった点を先に指摘し、こちらの確認不足を後回しにする',
          outcomeId: 'customer-closeout-blame-outcome',
        },
      ],
    },
    {
      id: 'customer-complete',
      kind: 'terminal',
      title: '取引先とのケースを終える',
      context: '金曜日 17:00｜振り返り後',
      narrative: '五つの判断を終えた。結果を振り返り、別の伝え方も試せる。',
      completion: {
        title: 'ケース完了',
        summary:
          '取引先との信頼は、都合のよい約束を重ねることではなく、前提を確認し、変化を早く伝え、相手が選べる案を示すことで守られる。',
      },
    },
  ],
  outcomes: [
    {
      id: 'customer-scope-confirm-outcome',
      category: 'strong',
      consequence:
        '対象ユーザーと必須項目、月曜に必要な確認範囲がそろい、取引先には条件付きの見通しを返せることになった。',
      feedback:
        '取引先の「可否だけ」という急ぎの依頼にも、前提が曖昧なまま断定しないことが重要。質問は相手を詰めるためではなく、同じ完成像を持つために行う。',
      recommendedExpression:
        '可否を正確にお伝えするため、対象となる利用者と必須項目、月曜時点で必要な確認範囲を先に確認させてください。',
      acceptableAlternatives: [
        '本日中に見通しをお返しします。判断に必要な前提を三点だけ確認してもよろしいでしょうか。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'customer-risk',
      skillTags: ['request-clarification'],
      libraryLinks: [{ bookId: 'book-sample-bj-email', chapterId: 'bm-ch-3' }],
    },
    {
      id: 'customer-scope-assume-outcome',
      category: 'mixed',
      consequence:
        '折り返す姿勢は伝わったが、社内で想定した範囲と取引先が求める範囲がずれる余地を残した。',
      feedback:
        '「確認して折り返します」は丁寧でも、確認項目を共有しないと相手は何を待てばよいか分からない。短い質問で認識をそろえると、後の手戻りを減らせる。',
      recommendedExpression:
        '確認して折り返します。対象となる利用者と必須項目も合わせて確認させてください。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'customer-risk',
      skillTags: ['request-clarification'],
    },
    {
      id: 'customer-scope-promise-outcome',
      category: 'risky',
      consequence:
        'その場では安心してもらえたが、後から追加条件が出たとき、最初の約束と実装範囲の食い違いが表面化した。',
      feedback:
        '取引先への即答は信頼に見えても、根拠のない「問題ありません」は期待値を固定する。分からない点を明示し、条件付きの見通しとして返すほうが誠実。',
      recommendedExpression:
        '現時点では判断材料が不足しています。対象範囲を確認のうえ、今日中に条件付きの見通しをお返しします。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'customer-risk',
      skillTags: ['request-clarification'],
    },
    {
      id: 'customer-risk-share-outcome',
      category: 'strong',
      consequence:
        '取引先は月曜に必要な範囲と残りの項目を分けて検討でき、社内も無理な全量対応を前提にせず準備できた。',
      feedback:
        '悪い知らせは、確定するまで隠すものではなく、見込みが変わった時点で共有する。事実、影響、選択肢を分ければ、相手は感情ではなく判断に集中できる。',
      recommendedExpression:
        '現時点では、全項目を月曜までに検証完了するのは難しい見込みです。必須三項目なら月曜に確認できますので、範囲を分ける案をご相談できればと思います。',
      acceptableAlternatives: [
        '見通しに変化がありましたので、早めにご報告します。月曜に必要な範囲を優先する案も含めてご相談させてください。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'customer-priority',
      skillTags: ['deadline-negotiation'],
      libraryLinks: [{ bookId: 'book-sample-bj-email', chapterId: 'bm-ch-3' }],
    },
    {
      id: 'customer-risk-wait-outcome',
      category: 'mixed',
      consequence:
        '社内の調整時間は増えたが、取引先は翌日まで判断材料を得られず、月曜の準備時間が短くなった。',
      feedback:
        '未確定の内容を断言する必要はないが、リスクの存在まで確定を待つ必要はない。「現時点の見込み」として共有し、更新時刻を約束するとよい。',
      recommendedExpression:
        'まだ確定ではありませんが、全範囲の月曜対応にはリスクがあります。明日午前までに選択肢を整理してご報告します。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'customer-priority',
      skillTags: ['deadline-negotiation'],
    },
    {
      id: 'customer-risk-hide-outcome',
      category: 'risky',
      consequence:
        '「対応可能」という期待だけが先に固定され、後から日程を変える連絡になり、取引先の会議準備を圧迫した。',
      feedback:
        '相手を安心させたい気持ちがあっても、根拠のない前向きな返答は後で大きな悪い知らせになる。リスクを早く、小さく、具体的に伝えるほうが関係を守る。',
      recommendedExpression:
        '現時点で全範囲をお約束するのは難しい状況です。月曜に必要な範囲を確認し、実現可能な案をご提示します。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'customer-priority',
      skillTags: ['deadline-negotiation'],
    },
    {
      id: 'customer-priority-slice-outcome',
      category: 'strong',
      consequence:
        '月曜は必須三項目を検証済みで提供し、残りは金曜に追加する段階納品で合意できた。',
      feedback:
        '「何とかします」と言う代わりに、相手の目的を満たす最小範囲と品質条件を一緒に決めた。納期交渉は拒否ではなく、優先順位を可視化する仕事。',
      recommendedExpression:
        '月曜の会議で必要な三項目は、検証まで終えてお渡しできます。残りは金曜に追加する二段階の納品ではいかがでしょうか。',
      acceptableAlternatives: [
        '月曜に必須の項目と、後日でもよい項目を分けていただければ、品質を保った案をご提示できます。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'customer-correction',
      skillTags: ['deadline-negotiation', 'request-clarification'],
      libraryLinks: [{ bookId: 'book-sample-bj-email', chapterId: 'bm-ch-3' }],
    },
    {
      id: 'customer-priority-best-effort-outcome',
      category: 'mixed',
      consequence:
        '前向きな姿勢は受け取られたが、月曜に何が使えるのか、品質を誰が確認するのかが決まらないままになった。',
      feedback:
        '「できる限り」は関係を壊さないクッションにはなるが、納期と範囲の合意にはならない。相手の目的を聞き、何を優先するかまで言葉にしたい。',
      recommendedExpression:
        '月曜に必要な範囲を確認できれば、実現可能な納品案と確認方法を具体的にお返しします。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'customer-correction',
      skillTags: ['deadline-negotiation'],
    },
    {
      id: 'customer-priority-refuse-outcome',
      category: 'risky',
      consequence:
        '制約は伝わったが、相手の目的を理解する前に突き放した印象になり、協議できた代案まで閉じてしまった。',
      feedback:
        'できないことを伝えるのは必要だが、「契約上無理」だけでは相手の判断材料にならない。制約、可能な範囲、代替案を順に示すと実務の会話になる。',
      recommendedExpression:
        '全項目を月曜に検証するのは難しい状況です。会議に必要な範囲であれば、段階納品の案をご相談できます。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'customer-correction',
      skillTags: ['deadline-negotiation'],
    },
    {
      id: 'customer-correction-facts-outcome',
      category: 'strong',
      consequence:
        '取引先は未確認の範囲を正しく把握でき、月曜に使う三項目への影響がないことと、残りの確認時刻を確認できた。',
      feedback:
        '訂正では、謝罪を大きくするより、何が誤っていたか、影響がどこまでか、いつ更新するかを明確にする。相手が次の行動を決められる情報が信頼を戻す。',
      recommendedExpression:
        '先ほどの進捗報告に誤りがありました。権限テスト一件が未確認で、月曜提供分の三項目には影響ありません。確認を本日二十時までに終え、結果を改めてご報告します。',
      acceptableAlternatives: [
        '私の確認不足で、完了としていた一件が未確認でした。影響範囲と修正時刻を分けてご報告します。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'customer-closeout',
      skillTags: ['error-reporting'],
      libraryLinks: [{ bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' }],
    },
    {
      id: 'customer-correction-apology-outcome',
      category: 'mixed',
      consequence:
        '誠意は伝わったが、取引先は月曜提供分への影響と、未確認分がいつ終わるのかをもう一度尋ねる必要があった。',
      feedback:
        '謝罪は必要だが、それだけでは相手の不安を解消できない。まず謝り、確認できた事実・影響・次の更新時刻を続けて示すと、丁寧さが実務の安心につながる。',
      recommendedExpression:
        '申し訳ありません。先ほどの報告に一件誤りがありました。月曜提供分への影響と、確認完了の時刻を続けてご報告します。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'customer-closeout',
      skillTags: ['error-reporting'],
    },
    {
      id: 'customer-correction-silent-outcome',
      category: 'risky',
      consequence:
        '文面は修正されたが、最初の報告を前提にした取引先の計画は訂正されず、後から発覚したときに説明の遅れが問題になった。',
      feedback:
        '記録を直すだけでは、すでにその情報を受け取った相手には届かない。誤りの影響を受ける相手へ、訂正を能動的に届けることが報告の責任。',
      recommendedExpression:
        '先ほどの報告を訂正します。未確認の権限パターンが一件あるため、月曜提供分への影響を確認して改めてご連絡します。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'customer-closeout',
      skillTags: ['error-reporting'],
    },
    {
      id: 'customer-closeout-facts-outcome',
      category: 'strong',
      consequence:
        '確認済みの事実と暫定対策、次回の更新時刻が記録に残り、取引先と社内が同じ基準で次の案件を始められる状態になった。',
      feedback:
        '原因がまだ確定していない段階で断定や責任転嫁をしない。事実、暫定対策、担当者、次の確認時刻を分けて共有すると、謝罪が再発防止の行動に変わる。',
      recommendedExpression:
        '現時点で確認できた事実は二点です。権限確認の手順に抜けがありましたので、暫定的に確認表を追加します。原因の確定結果と次回の更新は、来週火曜十七時までにご報告します。',
      acceptableAlternatives: [
        'ご迷惑をおかけし申し訳ありません。事実と暫定対策を分けて記録し、次回の確認時刻まで責任を持って更新します。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'customer-complete',
      skillTags: ['error-reporting', 'request-clarification'],
      libraryLinks: [{ bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' }],
    },
    {
      id: 'customer-closeout-apology-outcome',
      category: 'mixed',
      consequence:
        '反省の気持ちは伝わったが、取引先が求めていた原因の切り分けと次回の確認時刻は、別途すり合わせることになった。',
      feedback:
        '原因が未確定なら無理に断定しなくてよい。ただし「分かり次第」と終えると、相手はいつまで待つのか分からない。暫定策と更新時刻を置くことで、誠意を行動にできる。',
      recommendedExpression:
        '原因は現在確認中です。まずは確認表を追加し、来週火曜十七時までに切り分け結果と次の対策をご報告します。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'customer-complete',
      skillTags: ['error-reporting'],
    },
    {
      id: 'customer-closeout-blame-outcome',
      category: 'risky',
      consequence:
        '要件確認の不足は論点になったが、こちらの誤った進捗報告への説明が後回しになり、責任を外に置いた印象を残した。',
      feedback:
        '相手側の前提に課題があっても、こちらの報告ミスを先に引き受けるのが安全。原因の議論は事実を共有した後に行い、相手を責める言い方にしない。',
      recommendedExpression:
        '要件の確認方法にも改善点がありますが、まずは私たちの進捗報告に誤りがあったことをお詫びします。事実と対策を整理して共有します。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'customer-complete',
      skillTags: ['error-reporting'],
    },
  ],
} satisfies Scenario

const validation = validateScenario(authoredScenario)

if (!validation.ok) {
  throw new Error(
    `取引先との一手 scenario is invalid: ${validation.issues
      .map((issue) => `${issue.path} ${issue.code}`)
      .join(', ')}`,
  )
}

export const customerCommunicationScenario = validation.value
