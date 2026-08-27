import {
  CAREER_GAME_SCHEMA_VERSION,
  validateScenario,
  type Scenario,
} from '@business-japanese-hub/career-game'

const authoredScenario = {
  schemaVersion: CAREER_GAME_SCHEMA_VERSION,
  id: 'rookie-survival',
  slug: 'rookie-survival',
  contentVersion: 1,
  locale: 'ja-JP',
  title: '新人社員生存戦',
  subtitle: '最初の一週間、信頼をどう積み上げるか',
  summary:
    '配属初日の挨拶からミスの報告まで。正しさだけでは決まらない、日本の職場での「次の一手」を選ぶ五つのケースファイル。判断するたびに、その場の結果と職場語用論の解説を確認しながら進む。',
  startSceneId: 'file-one-greeting',
  characters: [
    { id: 'aoki-rookie', name: '青木', role: '新入社員（あなた）' },
    { id: 'sato-manager', name: '佐藤', role: '営業企画課長' },
    { id: 'tanaka-senior', name: '田中', role: '指導担当' },
    { id: 'kondo-colleague', name: '近藤', role: '同じチームの先輩' },
  ],
  meters: [{ id: 'trust', label: '信頼', min: -5, max: 5, initial: 0 }],
  skillTags: [
    'workplace-greeting',
    'request-clarification',
    'deadline-negotiation',
    'meeting-disagreement',
    'error-reporting',
  ],
  libraryLinks: [
    { bookId: 'book-sample-bj-email', chapterId: 'bm-ch-3' },
    { bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' },
    { bookId: 'book-meeting-japanese', chapterId: 'mj-ch-04' },
  ],
  scenes: [
    {
      id: 'file-one-greeting',
      kind: 'decision',
      title: '配属初日の挨拶',
      context: '月曜日 09:05｜営業企画部・朝会',
      narrative:
        'あなたは新入社員の青木。入社初日、課長から突然、二十人ほどの前で自己紹介をするよう促された。長く話す時間ではないが、名前だけで終えるのも心もとない。',
      dialogue: [
        {
          characterId: 'sato-manager',
          text: 'では、新しく加わったあなたから、一言ご挨拶をお願いします。',
        },
      ],
      prompt: '最初の一言として、どれを選ぶ？',
      choices: [
        {
          id: 'greeting-concise-choice',
          label: '所属と名前、学ぶ姿勢を簡潔に伝える',
          outcomeId: 'greeting-concise-outcome',
        },
        {
          id: 'greeting-humble-choice',
          label: '「何も分かりませんが」と控えめに始める',
          outcomeId: 'greeting-humble-outcome',
        },
        {
          id: 'greeting-credentials-choice',
          label: '前職での実績を中心に詳しく説明する',
          outcomeId: 'greeting-credentials-outcome',
        },
      ],
    },
    {
      id: 'file-two-request',
      kind: 'decision',
      title: '曖昧な依頼を受ける',
      context: '月曜日 16:10｜課長席の前',
      narrative:
        '佐藤課長から取引先向け資料の確認を頼まれた。明日の午前中という期限は分かったが、どこまで確認するのかは曖昧だ。',
      dialogue: [
        {
          characterId: 'sato-manager',
          text: 'この資料、明日の午前中までに確認してもらえますか。',
        },
      ],
      prompt: '引き受けるとき、どう返す？',
      choices: [
        {
          id: 'request-confirm-choice',
          label: '対象と提出時刻を具体的に確認する',
          outcomeId: 'request-confirm-outcome',
        },
        {
          id: 'request-simple-choice',
          label: '「承知しました」とだけ答えて着手する',
          outcomeId: 'request-simple-outcome',
        },
        {
          id: 'request-busy-choice',
          label: '今は手いっぱいだと先に断る',
          outcomeId: 'request-busy-outcome',
        },
      ],
    },
    {
      id: 'file-three-deadline',
      kind: 'decision',
      title: '期限が危うくなる',
      context: '月曜日 17:30｜自席',
      narrative:
        '確認に必要な数値がそろっておらず、明朝の約束に間に合わない可能性が高い。佐藤課長はまだ席にいる。',
      dialogue: [
        {
          characterId: 'tanaka-senior',
          text: '待っていれば数値は来ると思うけど……明日の朝だと、少し厳しいかもしれないね。',
        },
      ],
      prompt: '退勤前に、どの行動を取る？',
      choices: [
        {
          id: 'deadline-report-choice',
          label: '現状・影響・対応案をそろえて早めに相談する',
          outcomeId: 'deadline-report-outcome',
        },
        {
          id: 'deadline-peer-choice',
          label: '先輩にだけ相談し、朝まで様子を見る',
          outcomeId: 'deadline-peer-outcome',
        },
        {
          id: 'deadline-silent-choice',
          label: '何も言わず、できるところまで一人で進める',
          outcomeId: 'deadline-silent-outcome',
        },
      ],
    },
    {
      id: 'file-four-meeting',
      kind: 'decision',
      title: '会議で異論を伝える',
      context: '水曜日 14:00｜販売計画ミーティング',
      narrative:
        '田中先輩が発売日の前倒しを提案した。方向性には賛成だが、手元の数値を見ると現行案のままでは問い合わせ対応が追いつかない。',
      dialogue: [
        {
          characterId: 'tanaka-senior',
          text: '反応も良いですし、予定より一週間早めてはどうでしょう。',
        },
        {
          characterId: 'sato-manager',
          text: 'なるほど。ほかに意見はありますか。',
        },
      ],
      prompt: '会議の場で、どう発言する？',
      choices: [
        {
          id: 'meeting-build-choice',
          label: '賛意を示してから、懸念と代案を添える',
          outcomeId: 'meeting-build-outcome',
        },
        {
          id: 'meeting-later-choice',
          label: '会議では黙り、終了後に個別で伝える',
          outcomeId: 'meeting-later-outcome',
        },
        {
          id: 'meeting-reject-choice',
          label: '「その日程では無理です」と端的に反対する',
          outcomeId: 'meeting-reject-outcome',
        },
      ],
    },
    {
      id: 'file-five-error',
      kind: 'decision',
      title: 'ミスを報告して謝る',
      context: '金曜日 11:40｜案件共有チャット',
      narrative:
        '社内共有した資料の売上見込みに、転記ミスがあると気づいた。まだ取引先には送られていないが、会議では誤った数字が使われた。',
      dialogue: [
        {
          characterId: 'kondo-colleague',
          text: 'さっきの数字、元データと少し違うように見えるけど、確認した？',
        },
      ],
      prompt: '最初の報告として、何を伝える？',
      choices: [
        {
          id: 'error-facts-choice',
          label: '事実・影響範囲・修正予定をまとめてすぐ報告する',
          outcomeId: 'error-facts-outcome',
        },
        {
          id: 'error-apology-choice',
          label: 'まず何度も謝り、詳細は後から説明する',
          outcomeId: 'error-apology-outcome',
        },
        {
          id: 'error-replace-choice',
          label: '資料を差し替え、聞かれるまで報告しない',
          outcomeId: 'error-replace-outcome',
        },
      ],
    },
    {
      id: 'case-complete',
      kind: 'terminal',
      title: '一週間を終えて',
      context: '金曜日 18:00｜退勤前',
      narrative: '五つの判断を終えた。結果を振り返り、必要ならもう一度別の選択を試せる。',
      completion: {
        title: 'ケース完了',
        summary:
          '職場の信頼は、完璧な敬語だけでなく、早い確認、事実に基づく共有、相手が次に判断できる情報によって積み上がる。',
      },
    },
  ],
  outcomes: [
    {
      id: 'greeting-concise-outcome',
      category: 'strong',
      consequence: '要点が短くまとまり、周囲があなたの名前と姿勢をつかめた。',
      feedback:
        '初日の挨拶では、謙虚さを示しつつも「何をする人か」を消さないほうが、相手が声をかけやすい。',
      recommendedExpression:
        '本日より営業企画部に配属となりました、青木と申します。一日も早く力になれるよう努めます。どうぞよろしくお願いいたします。',
      acceptableAlternatives: [
        'まだ不慣れな点もございますが、早く業務を覚えられるよう努めます。よろしくお願いいたします。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'file-two-request',
      skillTags: ['workplace-greeting'],
      libraryLinks: [{ bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' }],
    },
    {
      id: 'greeting-humble-outcome',
      category: 'mixed',
      consequence: '控えめな印象は伝わったが、任せてよいことが周囲には見えにくかった。',
      feedback:
        '「何も分かりません」は謙虚でも、能力を全面的に否定して聞こえることがある。学ぶ姿勢を具体的に添えたい。',
      recommendedExpression: '不慣れな点もございますが、早く業務を覚えられるよう努めます。',
      acceptableAlternatives: ['ご指導いただきながら、一日も早く貢献できるよう努めます。'],
      effects: [],
      nextSceneId: 'file-two-request',
      skillTags: ['workplace-greeting'],
    },
    {
      id: 'greeting-credentials-outcome',
      category: 'risky',
      consequence: '実績は伝わったが、朝会の予定が押し、前職との比較だけが強く残った。',
      feedback:
        '経歴は有用でも、短い挨拶では現在の役割と周囲への敬意を先に置くほうが自然。詳細は聞かれた場で話せる。',
      recommendedExpression: '前職での経験も生かしながら、まずはこちらの仕事をしっかり学んでまいります。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'file-two-request',
      skillTags: ['workplace-greeting'],
    },
    {
      id: 'request-confirm-outcome',
      category: 'strong',
      consequence: '佐藤課長から、数値と表記の確認を明日十時までに、と具体的な返答を得た。',
      feedback:
        '依頼を受ける前後で対象と期限を具体化すると、手戻りを防げる。「確認」は拒否ではなく、合意形成の一部。',
      recommendedExpression:
        '承知しました。数値と表記を確認し、明日十時までにお戻しする、という認識でよろしいでしょうか。',
      acceptableAlternatives: [
        '念のため、確認する範囲とご希望の時刻を確認させてください。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'file-three-deadline',
      skillTags: ['request-clarification'],
      libraryLinks: [{ bookId: 'book-sample-bj-email', chapterId: 'bm-ch-3' }],
    },
    {
      id: 'request-simple-outcome',
      category: 'mixed',
      consequence: '依頼は素早く受けたが、確認範囲を自分で推測して進めることになった。',
      feedback:
        '「承知しました」は自然でも、それだけでは曖昧さは解消しない。復唱か質問を一つ添えると認識がそろう。',
      recommendedExpression: '承知しました。明日十時までに、数値と表記を確認してお戻しします。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'file-three-deadline',
      skillTags: ['request-clarification'],
    },
    {
      id: 'request-busy-outcome',
      category: 'risky',
      consequence: '負荷は伝わったが、課長には依頼そのものを拒まれたように聞こえた。',
      feedback:
        '難しいときほど、現在の状況と代替案をセットにする。単に「無理」と返すと、判断材料が足りない。',
      recommendedExpression:
        '現在の作業との兼ね合いで、明日十時ですと難しい可能性があります。優先順位をご相談してもよろしいでしょうか。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'file-three-deadline',
      skillTags: ['request-clarification'],
    },
    {
      id: 'deadline-report-outcome',
      category: 'strong',
      consequence: '課長が状況を把握し、先に確認できる部分を朝九時に共有する方針が決まった。',
      feedback:
        '期限直前の謝罪より、見通しが変わった時点での報告が有効。事実・影響・次の案があれば、上司は判断しやすい。',
      recommendedExpression:
        '必要な数値が未着のため、十時の完了が難しい見込みです。先に確認済みの箇所を九時に共有し、数値到着後に更新してもよろしいでしょうか。',
      acceptableAlternatives: [
        '現時点の見通しをご報告します。期限について一度ご相談させてください。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'file-four-meeting',
      skillTags: ['deadline-negotiation'],
    },
    {
      id: 'deadline-peer-outcome',
      category: 'mixed',
      consequence: '先輩とは懸念を共有できたが、期限を決める課長には情報が届かなかった。',
      feedback:
        '先輩への相談は助けになる。ただし、期限を変える判断者への報告を代替するものではない。',
      recommendedExpression: '田中さんにも相談しましたが、期限の見通しについて課長にご報告します。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'file-four-meeting',
      skillTags: ['deadline-negotiation'],
    },
    {
      id: 'deadline-silent-outcome',
      category: 'risky',
      consequence: '翌朝になって遅れが明らかになり、課長は対応を組み替える時間を失った。',
      feedback:
        '努力していることと、相手が状況を把握できることは別。遅れの可能性そのものが報告対象になる。',
      recommendedExpression: '完了前ですが、期限に影響する可能性があるため先にご報告します。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'file-four-meeting',
      skillTags: ['deadline-negotiation'],
    },
    {
      id: 'meeting-build-outcome',
      category: 'strong',
      consequence: '反対ではなく検討材料として受け止められ、段階的な前倒し案が議題になった。',
      feedback:
        '相手の狙いを認めてから、根拠と代案を述べると、異論を共同検討に変えやすい。常に婉曲である必要はないが、論点を人から切り離す。',
      recommendedExpression:
        '前倒しの方向性には賛成です。一方、問い合わせ対応の人数に懸念がありますので、対象を限定して先行する案はいかがでしょうか。',
      acceptableAlternatives: [
        '一点、運用面で確認したいことがあります。対応体制も合わせて検討できればと思います。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'file-five-error',
      skillTags: ['meeting-disagreement'],
      libraryLinks: [{ bookId: 'book-meeting-japanese', chapterId: 'mj-ch-04' }],
    },
    {
      id: 'meeting-later-outcome',
      category: 'mixed',
      consequence: '先輩には配慮できたが、会議では懸念がないものとして方針が進んだ。',
      feedback:
        '個別相談が適切な場面もある。ただし、その場の意思決定に必要な情報なら、短く論点を出す価値がある。',
      recommendedExpression: '結論の前に、運用面の懸念を一点共有してもよろしいでしょうか。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'file-five-error',
      skillTags: ['meeting-disagreement'],
    },
    {
      id: 'meeting-reject-outcome',
      category: 'risky',
      consequence: '懸念は伝わったが、先輩の提案全体を否定したように響き、議論が止まった。',
      feedback:
        '率直さ自体が悪いわけではない。「無理」の根拠と、成立させる条件まで示すと仕事上の発言になる。',
      recommendedExpression: '現行体制のままでは難しいと考えます。成立に必要な条件を二点共有します。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'file-five-error',
      skillTags: ['meeting-disagreement'],
    },
    {
      id: 'error-facts-outcome',
      category: 'strong',
      consequence: '誤りの範囲と修正時刻が共有され、取引先への送付前にチームで訂正できた。',
      feedback:
        '謝罪に加え、何が起きたか、どこまで影響するか、次に何をするかを一度に示すと、相手が対応を判断できる。',
      recommendedExpression:
        '先ほど共有した資料の売上見込みに転記ミスがありました。社内会議で使用した一か所が対象です。申し訳ありません。正しい数値に修正し、十二時までに差し替えます。',
      acceptableAlternatives: [
        '私の確認不足で誤りがありました。影響範囲と修正予定を続けてご報告します。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'case-complete',
      skillTags: ['error-reporting'],
      libraryLinks: [{ bookId: 'book-meeting-japanese', chapterId: 'mj-ch-02' }],
    },
    {
      id: 'error-apology-outcome',
      category: 'mixed',
      consequence: '反省は伝わったが、周囲は誤りの範囲と次の対応をもう一度尋ねる必要があった。',
      feedback:
        '謝罪の回数より、事実と回復行動の明確さが重要。詳細を隠す必要はないが、確認できた範囲を区切って話せる。',
      recommendedExpression: '申し訳ありません。現時点で確認できた事実と、これからの対応をご報告します。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'case-complete',
      skillTags: ['error-reporting'],
    },
    {
      id: 'error-replace-outcome',
      category: 'risky',
      consequence: '資料は直ったが、会議参加者は誤った数字を前提にしたままになった。',
      feedback:
        '差し替えだけでは、すでに生じた影響は戻らない。影響を受けた人に訂正を能動的に伝える必要がある。',
      recommendedExpression: '資料を差し替えました。先ほどの会議で参照した数値にも訂正がありますので、ご確認ください。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'case-complete',
      skillTags: ['error-reporting'],
    },
  ],
} satisfies Scenario

const validation = validateScenario(authoredScenario)

if (!validation.ok) {
  throw new Error(
    `新人社員生存戦 scenario is invalid: ${validation.issues
      .map((issue) => `${issue.path} ${issue.code}`)
      .join(', ')}`,
  )
}

export const rookieSurvivalScenario = validation.value
