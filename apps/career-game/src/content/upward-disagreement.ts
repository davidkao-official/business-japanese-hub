import {
  CAREER_GAME_SCHEMA_VERSION,
  validateScenario,
  type Scenario,
} from '@business-japanese-hub/career-game'

const authoredScenario = {
  schemaVersion: CAREER_GAME_SCHEMA_VERSION,
  id: 'upward-disagreement',
  slug: 'upward-disagreement',
  contentVersion: 1,
  locale: 'ja-JP',
  title: '上司の案に異議を伝える',
  subtitle: '反対ではなく、判断材料として提案する',
  summary:
    '前倒しを望む部長に、現場のリスクをどう伝えるか。' +
    '一対一の相談、会議での異論、資料の書き方、決定後の実行まで、上位者への異議を仕事の前進につなげる五つのケースファイル。',
  startSceneId: 'upward-one-on-one',
  characters: [
    { id: 'kido-you', name: '木戸', role: '事業企画担当（あなた）' },
    { id: 'takeda-manager', name: '武田', role: '事業開発部長' },
    { id: 'yamada-quality', name: '山田', role: '品質保証リード' },
    { id: 'fujii-product', name: '藤井', role: 'プロダクトマネージャー' },
  ],
  meters: [{ id: 'trust', label: '信頼', min: -5, max: 5, initial: 0 }],
  skillTags: [
    'meeting-disagreement',
    'request-clarification',
    'deadline-negotiation',
    'error-reporting',
  ],
  libraryLinks: [
    { bookId: 'book-meeting-japanese', chapterId: 'mj-ch-04' },
    { bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' },
  ],
  scenes: [
    {
      id: 'upward-one-on-one',
      kind: 'decision',
      title: '会議の前に懸念を相談する',
      context: '月曜日 09:30｜部長席の前',
      narrative:
        '武田部長は、新サービスの公開日を当初の予定より一週間前倒ししたいと考えている。' +
        'あなたの手元には、まだ解消していない高影響の不具合三件と、品質確認に必要な日数の見積もりがある。午後の会議で決まる前に、部長へ相談できる時間は十分にない。',
      dialogue: [
        {
          characterId: 'takeda-manager',
          text: '午後の会議では、公開を一週間前倒しする案を出します。木戸さん、現場の感触はどうですか。',
        },
      ],
      prompt: '上司の狙いを尊重しながら、最初にどう切り出す？',
      choices: [
        {
          id: 'upward-one-on-one-consult-choice',
          label: '目的への賛意を示し、根拠と代案を短く相談する',
          outcomeId: 'upward-one-on-one-consult-outcome',
        },
        {
          id: 'upward-one-on-one-email-choice',
          label: 'その場ではうなずき、後で詳細なデータをメールする',
          outcomeId: 'upward-one-on-one-email-outcome',
        },
        {
          id: 'upward-one-on-one-reject-choice',
          label: '「その日程は無理です」と結論だけを伝える',
          outcomeId: 'upward-one-on-one-reject-outcome',
        },
      ],
    },
    {
      id: 'upward-steering',
      kind: 'decision',
      title: '会議で異論を判断材料に変える',
      context: '月曜日 14:00｜公開計画レビュー',
      narrative:
        '会議で武田部長が「二週間で公開する」案を提示した。目的には賛成だが、現行の検証体制では不具合三件を確認しきれない。部長から、参加者全員に意見を求められた。',
      dialogue: [
        {
          characterId: 'takeda-manager',
          text: 'この機会を逃したくありません。二週間で公開する前提で進めたいと思いますが、異論はありますか。',
        },
        {
          characterId: 'fujii-product',
          text: '営業側としても、早く案内できるのは助かります。',
        },
      ],
      prompt: 'その場で、どのように発言する？',
      choices: [
        {
          id: 'upward-steering-build-choice',
          label: '狙いを認めてから、影響と成立条件、代案を示す',
          outcomeId: 'upward-steering-build-outcome',
        },
        {
          id: 'upward-steering-silent-choice',
          label: '会議では黙り、終了後に個別で懸念を伝える',
          outcomeId: 'upward-steering-silent-outcome',
        },
        {
          id: 'upward-steering-attack-choice',
          label: '「その計画は現実を見ていません」と端的に反対する',
          outcomeId: 'upward-steering-attack-outcome',
        },
      ],
    },
    {
      id: 'upward-evidence',
      kind: 'decision',
      title: '具体的な判断材料を一分で出す',
      context: '月曜日 14:20｜公開計画レビュー',
      narrative:
        '懸念を述べると、武田部長は「具体的に、何があれば二週間案を判断できますか」と尋ねた。' +
        '品質保証の山田さんは、三件のうち一件は公開範囲を限定すれば回避でき、残り二件は追加検証が必要だと整理している。',
      dialogue: [
        {
          characterId: 'takeda-manager',
          text: '懸念は分かりました。二週間案を判断するために、必要な条件を具体的に教えてください。',
        },
        {
          characterId: 'yamada-quality',
          text: '影響の大きい二件は、少なくとも追加で三営業日の確認が必要です。',
        },
      ],
      prompt: '上司が判断できるよう、何を返す？',
      choices: [
        {
          id: 'upward-evidence-structure-choice',
          label: '未解決点・影響・選択肢・推奨案を一分で整理する',
          outcomeId: 'upward-evidence-structure-outcome',
        },
        {
          id: 'upward-evidence-detail-choice',
          label: '細かいデータをすべて読み上げ、結論は相手に任せる',
          outcomeId: 'upward-evidence-detail-outcome',
        },
        {
          id: 'upward-evidence-people-choice',
          label: '「現場が反対しています」と人を主語にして説明する',
          outcomeId: 'upward-evidence-people-outcome',
        },
      ],
    },
    {
      id: 'upward-plan-note',
      kind: 'decision',
      title: '暫定案と確定事項を資料で分ける',
      context: '火曜日 10:00｜会議資料の最終確認',
      narrative:
        '会議では「限定公開を二週間後に行い、残りの検証後に全体公開を再判断する」案が有力になった。' +
        'しかし共有資料のスライドには、部長が最初に示した全体公開日だけが残っている。取引先向け説明にも使われる資料なので、曖昧なままでは期待値がずれる。',
      dialogue: [
        {
          characterId: 'fujii-product',
          text: '資料は前の版を流用しています。全体公開の日付は、ひとまずそのままでよいでしょうか。',
        },
      ],
      prompt: '上司の案に配慮しつつ、資料をどう整える？',
      choices: [
        {
          id: 'upward-plan-note-align-choice',
          label: '確定事項・判断待ち・再判断の条件を分け、部長に確認する',
          outcomeId: 'upward-plan-note-align-outcome',
        },
        {
          id: 'upward-plan-note-keep-choice',
          label: '部長の意向を優先して日付を残し、口頭でだけ補足する',
          outcomeId: 'upward-plan-note-keep-outcome',
        },
        {
          id: 'upward-plan-note-edit-choice',
          label: '相談せずに日付を書き換え、完成版として配布する',
          outcomeId: 'upward-plan-note-edit-outcome',
        },
      ],
    },
    {
      id: 'upward-commitment',
      kind: 'decision',
      title: '決定後の実行条件を合意する',
      context: '金曜日 17:40｜限定公開前のチーム確認',
      narrative:
        '限定公開は二週間後、全体公開は追加検証の結果を見て再判断する方針になった。' +
        '一件のリスクは受け入れる決定だが、対応条件を明文化しておかなければ、懸念を出した人が決定に従っていないようにも、無条件に約束したようにも見える。',
      dialogue: [
        {
          characterId: 'takeda-manager',
          text: 'では、この方針で進めましょう。木戸さん、チームへの共有と、次の報告をお願いします。',
        },
      ],
      prompt: '異論を述べた後、決定をどう実行に移す？',
      choices: [
        {
          id: 'upward-commitment-checkpoint-choice',
          label: '決定を受け入れ、確認ポイントと報告時刻を合意する',
          outcomeId: 'upward-commitment-checkpoint-outcome',
        },
        {
          id: 'upward-commitment-just-follow-choice',
          label: '「承知しました」とだけ返し、細部はチームに任せる',
          outcomeId: 'upward-commitment-just-follow-outcome',
        },
        {
          id: 'upward-commitment-resist-choice',
          label: '自分の懸念を理由に、チームへ消極的な指示を出す',
          outcomeId: 'upward-commitment-resist-outcome',
        },
      ],
    },
    {
      id: 'upward-complete',
      kind: 'terminal',
      title: '判断と実行のケースを終える',
      context: '金曜日 18:00｜チーム共有後',
      narrative: '五つの判断を終えた。結果を振り返り、別の異議の伝え方も試せる。',
      completion: {
        title: 'ケース完了',
        summary:
          '上司への異議は、権威に勝つための反論ではない。目的への賛意、根拠、成立条件、代案をそろえ、決定後は合意した条件で実行するための仕事である。',
      },
    },
  ],
  outcomes: [
    {
      id: 'upward-one-on-one-consult-outcome',
      category: 'strong',
      consequence:
        '部長は前倒しの目的を保ったまま、限定公開と追加検証を組み合わせる案を会議で検討すると約束した。',
      feedback:
        '上司の意図を認めたうえで、数字と代案を短く出すと、異議が「反対」ではなく「成功条件の相談」になる。一対一で先に共有するのは、会議を驚かせない配慮でもある。',
      recommendedExpression:
        '前倒しの目的には賛成です。一方、未解消の不具合三件があり、全体公開には追加三営業日が必要です。まず限定公開を二週間後に行い、確認結果で全体公開を判断する案をご相談できますでしょうか。',
      acceptableAlternatives: [
        '目的は維持したいのですが、品質条件を満たすための選択肢を二つ整理しました。午後の会議で共有してもよろしいでしょうか。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'upward-steering',
      skillTags: ['meeting-disagreement', 'request-clarification'],
      libraryLinks: [{ bookId: 'book-meeting-japanese', chapterId: 'mj-ch-04' }],
    },
    {
      id: 'upward-one-on-one-email-outcome',
      category: 'mixed',
      consequence:
        'データは残ったが、会議の前提は変わらず、部長は懸念を共有されていないまま前倒し案を進めることになった。',
      feedback:
        '詳細なメールが悪いわけではないが、重要な異論を後から一方的に送ると、相談ではなく差し戻しに見えやすい。まず要点を口頭で伝え、資料で補強すると伝わり方が安定する。',
      recommendedExpression:
        '一点、公開条件について懸念があります。概要だけ先にご相談し、根拠のデータはこの後お送りします。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'upward-steering',
      skillTags: ['meeting-disagreement'],
    },
    {
      id: 'upward-one-on-one-reject-outcome',
      category: 'risky',
      consequence:
        '制約は伝わったが、部長の目的や成立条件を確認する前に案を退けたため、協力して調整する入口を狭めた。',
      feedback:
        '上司に率直に伝えること自体は問題ではない。ただし「無理です」だけでは判断材料がなく、能力や意欲を否定したようにも響く。目的、根拠、代案を分けると建設的になる。',
      recommendedExpression:
        '現行の確認体制のままでは難しいと考えます。目的を保つために、限定公開と追加検証を組み合わせる案をご相談させてください。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'upward-steering',
      skillTags: ['meeting-disagreement'],
    },
    {
      id: 'upward-steering-build-outcome',
      category: 'strong',
      consequence:
        '部長は前倒しの狙いを維持しつつ、限定公開と追加検証を条件にした案を会議の検討事項として採用した。',
      feedback:
        '会議では、相手の目的を受け止め、懸念を人ではなく条件として示し、代案まで出す。婉曲にすることが目的ではなく、参加者が同じ論点で判断できる形にすることが大切。',
      recommendedExpression:
        '前倒しの方向性には賛成です。一方、全体公開には三件の不具合確認が残っていますので、二週間後は限定公開とし、二件の追加検証を終えた時点で全体公開を再判断する案はいかがでしょうか。',
      acceptableAlternatives: [
        '一点、品質面の成立条件を共有します。目的を保ったまま、公開範囲を限定する案も合わせてご検討いただければと思います。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'upward-evidence',
      skillTags: ['meeting-disagreement'],
      libraryLinks: [{ bookId: 'book-meeting-japanese', chapterId: 'mj-ch-04' }],
    },
    {
      id: 'upward-steering-silent-outcome',
      category: 'mixed',
      consequence:
        '会議では反対意見がないまま前提が固まり、終了後に懸念を伝えた結果、議事録と実際の認識を合わせ直す必要が生じた。',
      feedback:
        '個別に伝えるほうがよい話もあるが、その場の判断に必要なリスクなら、短くでも共有する価値がある。後から異論を出すと、決定を覆したいように受け取られやすい。',
      recommendedExpression:
        '結論の前に、品質面で判断に関わる懸念を一点共有してもよろしいでしょうか。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'upward-evidence',
      skillTags: ['meeting-disagreement'],
    },
    {
      id: 'upward-steering-attack-outcome',
      category: 'risky',
      consequence:
        '懸念は目立ったが、部長の計画と現場の能力を一括して否定したように響き、具体的な検討に移る前に場が硬くなった。',
      feedback:
        '強い言い方で注目を集めても、相手の面子を潰すと情報交換が止まる。人や計画を攻撃せず、どの条件なら成立するかを示すと異論が仕事になる。',
      recommendedExpression:
        '現行条件のままでは品質を保証できないと考えます。成立に必要な検証期間と、公開範囲を限定する案を共有します。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'upward-evidence',
      skillTags: ['meeting-disagreement'],
    },
    {
      id: 'upward-evidence-structure-outcome',
      category: 'strong',
      consequence:
        '未解決点と影響、二つの選択肢、推奨案が一分で共有され、部長は「限定公開を先に進め、金曜に再判断する」決定を下せた。',
      feedback:
        '上司が求めているのは、反対者の気持ちではなく判断できる材料。事実、影響、選択肢、推奨を分け、最後に何を決めてほしいかを明示すると、異論が意思決定を速くする。',
      recommendedExpression:
        '未解決は二件で、全体公開なら三営業日の追加確認が必要です。二週間後に限定公開する案なら影響を抑えられます。私は限定公開後、金曜に全体公開を再判断する案を推奨します。',
      acceptableAlternatives: [
        '判断いただきたいのは公開範囲です。品質を優先するなら限定公開、全体公開を維持するなら日程を三日延ばす選択になります。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'upward-plan-note',
      skillTags: ['meeting-disagreement', 'request-clarification'],
      libraryLinks: [{ bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' }],
    },
    {
      id: 'upward-evidence-detail-outcome',
      category: 'mixed',
      consequence:
        '情報量は多かったが、何が重要で何を決めるのかが会議中に見えにくく、部長は暫定的に元の前倒し案を維持した。',
      feedback:
        '根拠を出すことと、データをすべて読み上げることは違う。意思決定のための要点を先に置き、詳細は資料に分けると、相手の時間と立場に配慮できる。',
      recommendedExpression:
        '結論から申し上げると、全体公開なら三営業日の追加確認が必要です。詳細な根拠は資料にまとめ、まず公開範囲をご判断いただけますでしょうか。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'upward-plan-note',
      skillTags: ['meeting-disagreement'],
    },
    {
      id: 'upward-evidence-people-outcome',
      category: 'risky',
      consequence:
        '現場の声は伝わったが、部長には「誰かが反対している」という対立構図として届き、必要な条件の検討が後回しになった。',
      feedback:
        '「現場が反対」は責任の所在をぼかし、上司とチームを対立させやすい。観測した事実、影響、必要な条件を自分の責任で述べると、上に伝える情報になる。',
      recommendedExpression:
        '私が確認した範囲では、二件について三営業日の追加検証が必要です。公開範囲を限定する案を含めてご判断いただきたいです。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'upward-plan-note',
      skillTags: ['meeting-disagreement'],
    },
    {
      id: 'upward-plan-note-align-outcome',
      category: 'strong',
      consequence:
        '資料には限定公開の日付、全体公開の判断待ち、再判断の条件が分けて記載され、部長の確認を得て同じ情報が共有された。',
      feedback:
        '上司の意向に配慮することは、曖昧な日付を残すことではない。確定事項と暫定案を分け、判断待ちの条件を可視化してから確認を取ると、忠実さと正確さを両立できる。',
      recommendedExpression:
        '資料上、二週間後は限定公開、全体公開は追加検証後に再判断と分けて記載します。再判断の条件はこの二点でよろしいか、部長に確認させてください。',
      acceptableAlternatives: [
        '誤解を避けるため、確定した範囲と判断待ちの範囲を分けて更新します。共有前にご確認いただけますでしょうか。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'upward-commitment',
      skillTags: ['request-clarification', 'deadline-negotiation'],
      libraryLinks: [{ bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' }],
    },
    {
      id: 'upward-plan-note-keep-outcome',
      category: 'mixed',
      consequence:
        '口頭で補足した人には伝わったが、資料だけを見る取引先や別部署には全体公開が確定したように見える余地が残った。',
      feedback:
        '口頭の補足はその場では便利でも、資料が記録として使われるなら不十分。上司の意向を守るためにも、確定・暫定・条件を同じ文書に残す必要がある。',
      recommendedExpression:
        '誤解を避けるため、資料にも限定公開と再判断の条件を注記します。部長の意図と違わないか確認させてください。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'upward-commitment',
      skillTags: ['request-clarification'],
    },
    {
      id: 'upward-plan-note-edit-outcome',
      category: 'risky',
      consequence:
        '事実に近い日付にはなったが、部長が承認した内容と異なる資料を無断で配布したため、修正の経緯そのものが問題になった。',
      feedback:
        '正しいと思う内容でも、上司の判断に関わる資料を無断で書き換えると、異議ではなく権限逸脱に見える。変更案と理由を示し、確認を得てから共有する。',
      recommendedExpression:
        '全体公開日を確定と読まれないよう修正案を作成しました。判断待ちの条件を含め、この内容で共有してよいかご確認ください。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'upward-commitment',
      skillTags: ['request-clarification'],
    },
    {
      id: 'upward-commitment-checkpoint-outcome',
      category: 'strong',
      consequence:
        'チームは決定を共通認識にし、火曜と金曜の確認点、リスクが再発した場合の報告先と時刻を合意して実行に移れた。',
      feedback:
        '異議を述べた後に決定へコミットすることは、懸念を撤回することではない。合意した条件を記録し、変化があれば早く報告できる仕組みまで作るのが上向きの提案の完成形。',
      recommendedExpression:
        '方針を承知しました。火曜に限定公開の確認、金曜に全体公開の再判断を行い、二件の検証で新しいリスクが出た場合は同日中にご報告する、という認識で共有します。',
      acceptableAlternatives: [
        '決定に沿って進めます。品質条件と再判断の時刻をチームに明示し、変化があればすぐご報告します。',
      ],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: 1 }],
      nextSceneId: 'upward-complete',
      skillTags: ['deadline-negotiation', 'error-reporting'],
      libraryLinks: [{ bookId: 'book-meeting-japanese', chapterId: 'mj-ch-04' }],
    },
    {
      id: 'upward-commitment-just-follow-outcome',
      category: 'mixed',
      consequence:
        '決定には従ったが、確認点と報告条件がチームごとに解釈され、追加検証の進み具合をそろえるための確認が増えた。',
      feedback:
        '「承知しました」は受諾を示すが、実行条件までは共有しない。異論を出した後ほど、どの条件で何を報告するのかを具体化すると、協力姿勢が伝わる。',
      recommendedExpression:
        '承知しました。確認点と再判断の条件を整理して、チームに共有したうえで進めます。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'upward-complete',
      skillTags: ['deadline-negotiation'],
    },
    {
      id: 'upward-commitment-resist-outcome',
      category: 'risky',
      consequence:
        '決定への不満がチームに広がり、必要な検証が遅れたうえ、部長には方針に従わない担当者と受け取られた。',
      feedback:
        '採用されなかった異論を持ち続けてもよいが、消極的な指示で決定を妨げてはいけない。懸念は条件と報告経路に落とし、決まった方針のもとで安全に実行する。',
      recommendedExpression:
        '懸念は記録に残しますが、決定した方針で進めます。確認点と報告条件を明確にして、チームに共有します。',
      acceptableAlternatives: [],
      effects: [{ kind: 'adjustMeter', meterId: 'trust', amount: -1 }],
      nextSceneId: 'upward-complete',
      skillTags: ['deadline-negotiation', 'error-reporting'],
    },
  ],
} satisfies Scenario

const validation = validateScenario(authoredScenario)

if (!validation.ok) {
  throw new Error(
    `上司の案に異議を伝える scenario is invalid: ${validation.issues
      .map((issue) => `${issue.path} ${issue.code}`)
      .join(', ')}`,
  )
}

export const upwardDisagreementScenario = validation.value
