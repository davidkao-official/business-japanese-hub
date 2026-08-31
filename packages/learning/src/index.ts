export const LEARNING_SKILLS = [
  {
    id: 'workplace-greeting',
    category: 'workplace-situation',
    labels: { ja: '職場での挨拶', en: 'Workplace greetings' },
  },
  {
    id: 'request-clarification',
    category: 'communication-skill',
    labels: { ja: '確認を依頼する', en: 'Requesting clarification' },
  },
  {
    id: 'deadline-negotiation',
    category: 'communication-skill',
    labels: { ja: '期限を交渉する', en: 'Negotiating deadlines' },
  },
  {
    id: 'meeting-disagreement',
    category: 'communication-skill',
    labels: { ja: '会議で異議を伝える', en: 'Expressing disagreement in meetings' },
  },
  {
    id: 'error-reporting',
    category: 'workplace-situation',
    labels: { ja: 'ミスを報告する', en: 'Reporting mistakes' },
  },
] as const;

export type LearningSkill = (typeof LEARNING_SKILLS)[number];
export type LearningSkillId = LearningSkill['id'];
export type LearningSkillCategory = LearningSkill['category'];

export const LEARNING_SKILL_IDS: readonly LearningSkillId[] = LEARNING_SKILLS.map(
  ({ id }) => id,
);

const learningSkillIds = new Set<string>(LEARNING_SKILL_IDS);

export function isLearningSkillId(value: unknown): value is LearningSkillId {
  return typeof value === 'string' && learningSkillIds.has(value);
}

export type LearningSkillIdsValidation =
  | { ok: true; value: LearningSkillId[] }
  | { ok: false; reason: string };

/** Validate an authored skill-id array without sorting or silently dropping data. */
export function validateLearningSkillIds(value: unknown): LearningSkillIdsValidation {
  if (!Array.isArray(value)) return { ok: false, reason: 'must be an array' };

  const skillIds: LearningSkillId[] = [];
  const seen = new Set<LearningSkillId>();
  for (const [index, skillId] of value.entries()) {
    if (!isLearningSkillId(skillId)) {
      return {
        ok: false,
        reason: `skillIds[${index}] must be a known learning skill ID`,
      };
    }
    if (seen.has(skillId)) {
      return {
        ok: false,
        reason: `skillIds must not contain duplicate "${skillId}"`,
      };
    }
    seen.add(skillId);
    skillIds.push(skillId);
  }
  return { ok: true, value: skillIds };
}
