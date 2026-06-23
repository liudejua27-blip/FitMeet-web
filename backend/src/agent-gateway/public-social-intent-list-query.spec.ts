import { SocialRequestStatus } from './entities/social-request.entity';
import { normalizePublicSocialIntentListFilters } from './public-social-intent-list-query';

describe('normalizePublicSocialIntentListFilters', () => {
  it('defaults public intents to discoverable supply statuses', () => {
    expect(normalizePublicSocialIntentListFilters()).toEqual({
      page: 1,
      take: 30,
      skip: 0,
      q: undefined,
      city: undefined,
      requestType: undefined,
      status: undefined,
      statuses: [
        SocialRequestStatus.Active,
        SocialRequestStatus.Matched,
        SocialRequestStatus.Searching,
      ],
    });
  });

  it('clamps pagination and trims searchable filters', () => {
    expect(
      normalizePublicSocialIntentListFilters({
        page: 3,
        limit: 500,
        q: '  yoga  ',
        city: '  上海市  ',
        requestType: ' fitness_partner ',
        status: SocialRequestStatus.Matched,
      }),
    ).toEqual({
      page: 3,
      take: 50,
      skip: 100,
      q: 'yoga',
      city: '上海',
      requestType: 'fitness_partner',
      status: SocialRequestStatus.Matched,
      statuses: [SocialRequestStatus.Matched],
    });
  });

  it('falls back from invalid pagination and status values', () => {
    expect(
      normalizePublicSocialIntentListFilters({
        page: -4,
        limit: 0,
        q: '   ',
        status: 'not-a-status' as SocialRequestStatus,
      }),
    ).toEqual({
      page: 1,
      take: 30,
      skip: 0,
      q: undefined,
      city: undefined,
      requestType: undefined,
      status: undefined,
      statuses: [
        SocialRequestStatus.Active,
        SocialRequestStatus.Matched,
        SocialRequestStatus.Searching,
      ],
    });
  });
});
