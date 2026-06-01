import { LifeGraphExtractionService } from './life-graph-extraction.service';
import {
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
} from './life-graph.enums';

describe('LifeGraphExtractionService', () => {
  const service = new LifeGraphExtractionService();

  it('extracts Life Graph fields from Chinese natural language', () => {
    const result = service.extractFromChat(
      '我在青岛大学附近，周末下午比较有空，想找一个跑步搭子，最好先聊聊再约，不太想晚上见面。',
    );

    expect(result.proposedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'city',
          fieldValue: '青岛',
          source: LifeGraphFieldSource.AiInferred,
          requiresUserConfirmation: true,
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'nearbyArea',
          fieldValue: '青岛大学附近',
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['周末下午'],
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'sportsPreferences',
          fieldValue: ['跑步'],
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.SocialIntent,
          fieldKey: 'preferredSocialStyle',
          fieldValue: '先聊天后见面',
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'acceptsNightMeet',
          fieldValue: false,
        }),
      ]),
    );
    expect(result.summary).toContain('青岛大学附近');
  });

  it('extracts Life Graph fields from English natural language', () => {
    const result = service.extractFromChat(
      'I am near Qingdao University. I am free on weekend afternoons and looking for a running partner. I prefer to chat first and meet in a public place.',
    );

    expect(result.proposedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: LifeGraphFieldCategory.Identity,
          fieldKey: 'nearbyArea',
          fieldValue: 'Qingdao University',
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.Lifestyle,
          fieldKey: 'availableTimes',
          fieldValue: ['周末下午'],
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'sportsPreferences',
          fieldValue: ['跑步'],
        }),
        expect.objectContaining({
          category: LifeGraphFieldCategory.FitnessActivity,
          fieldKey: 'publicPlaceOnly',
          fieldValue: true,
        }),
      ]),
    );
  });

  it('marks AI inferred fields as proposed candidates rather than official fields', () => {
    const result = service.extractFromChat('周末下午想找跑步搭子。');

    expect(result.proposedFields.length).toBeGreaterThan(0);
    for (const field of result.proposedFields) {
      expect(field.source).toBe(LifeGraphFieldSource.AiInferred);
      expect(field.requiresUserConfirmation).toBe(true);
      expect(field.confidence).toBeGreaterThan(0);
      expect(field.reason).toBeTruthy();
    }
  });

  it('does not extract Trust Safety Graph fields from ordinary chat', () => {
    const result = service.extractFromChat(
      '我希望严格确认，周末下午找跑步搭子，最好公共场所。',
    );

    expect(result.proposedFields).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: LifeGraphFieldCategory.TrustSafety,
        }),
      ]),
    );
  });
});
