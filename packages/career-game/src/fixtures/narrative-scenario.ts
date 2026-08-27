import { CAREER_GAME_SCHEMA_VERSION } from '../types'
import type { Scenario } from '../types'

export const narrativeScenario = {
  schemaVersion: CAREER_GAME_SCHEMA_VERSION,
  id: 'meeting-agenda',
  slug: 'meeting-agenda',
  contentVersion: 3,
  locale: 'ja-JP',
  title: '会議前の論点整理',
  summary: '短い準備時間で、会議の目的を参加者に伝えるケース。',
  startSceneId: 'prepare',
  characters: [],
  skillTags: ['meeting-preparation'],
  scenes: [
    {
      id: 'prepare',
      kind: 'decision',
      context: '部門横断会議まであと30分。議題は共有されていない。',
      narrative: '参加者はそれぞれ異なる前提を持っている。',
      prompt: '会議前に何をする？',
      choices: [
        { id: 'send-agenda', label: '論点と決めたいことを共有する', outcomeId: 'agenda-ready' },
        { id: 'wait-meeting', label: '会議が始まってから説明する', outcomeId: 'agenda-late' },
      ],
    },
    {
      id: 'prepared',
      kind: 'terminal',
      context: '参加者が論点を確認して会議に入った。',
      completion: { title: '準備完了', summary: '目的と決定事項を事前にそろえた。' },
    },
    {
      id: 'unprepared',
      kind: 'terminal',
      context: '冒頭で前提の確認に時間を使った。',
      completion: { title: 'ケース完了', summary: '事前共有できる情報を見極めよう。' },
    },
  ],
  outcomes: [
    {
      id: 'agenda-ready',
      category: 'strong',
      consequence: '参加者が事前に論点を確認できた。',
      feedback: '目的と決めたいことを短く共有した。',
      recommendedExpression: '本日の論点と、決めたい事項を事前に共有いたします。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'prepared',
    },
    {
      id: 'agenda-late',
      category: 'risky',
      consequence: '会議の冒頭で認識合わせが必要になった。',
      feedback: '短い情報でも事前に共有すると、参加者が準備できる。',
      recommendedExpression: '直前で恐縮ですが、本日の論点を共有します。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'unprepared',
    },
  ],
} satisfies Scenario
