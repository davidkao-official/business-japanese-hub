import { describe, expect, it } from 'vitest';
import {
  LEARNING_SKILLS,
  LEARNING_SKILL_IDS,
  isLearningSkillId,
  validateLearningSkillIds,
} from './index';

describe('learning skill taxonomy', () => {
  it('exposes the exact small, stable, human-readable catalog in canonical order', () => {
    expect(LEARNING_SKILLS).toEqual([
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
    ]);
    expect(LEARNING_SKILL_IDS).toEqual(LEARNING_SKILLS.map(({ id }) => id));
  });

  it('recognizes only catalog identifiers', () => {
    expect(isLearningSkillId('workplace-greeting')).toBe(true);
    expect(isLearningSkillId('deadline-negotiation')).toBe(true);
    expect(isLearningSkillId('made-up-skill')).toBe(false);
    expect(isLearningSkillId(57)).toBe(false);
  });

  it('validates an exact skill-id array without changing authored order', () => {
    expect(validateLearningSkillIds(['meeting-disagreement', 'request-clarification'])).toEqual({
      ok: true,
      value: ['meeting-disagreement', 'request-clarification'],
    });
  });

  it.each([
    { value: 'workplace-greeting', reason: 'must be an array' },
    { value: [57], reason: 'skillIds[0] must be a known learning skill ID' },
    { value: ['made-up-skill'], reason: 'skillIds[0] must be a known learning skill ID' },
    {
      value: ['error-reporting', 'error-reporting'],
      reason: 'skillIds must not contain duplicate "error-reporting"',
    },
  ])('rejects malformed, unknown, and duplicate identifiers: $reason', ({ value, reason }) => {
    expect(validateLearningSkillIds(value)).toEqual({ ok: false, reason });
  });
});
