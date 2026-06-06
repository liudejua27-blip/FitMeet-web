import { buildSocialAgentProfileContextPatch } from './social-agent-profile-context-patch';

describe('buildSocialAgentProfileContextPatch', () => {
  it('maps extracted agent context into a social profile update dto', () => {
    const patch = buildSocialAgentProfileContextPatch({
      extractedProfile: {
        gender: ' male ',
        ageRange: '18',
        city: ' Qingdao ',
        nearbyArea: 'Qingdao University',
        zodiac: 'Aries',
        mbti: 'INFP',
        personality: [' curious ', '', 'patient'],
        interestTags: ['running', 'coffee'],
        availableTimes: ['weekend'],
        socialGoal: ['same-school women'],
        targetPreference: 'same-school women',
        rejectRules: 'No late night first meetups',
        privacyBoundary: 'No phone number before meeting',
        height: '181cm',
        weight: '70kg',
        school: 'Qingdao University',
      },
      sourceMessage:
        'I am an Aries male studying in Qingdao University and want running friends.',
    });

    expect(patch.dto).toMatchObject({
      gender: 'male',
      ageRange: '18',
      city: 'Qingdao',
      nearbyArea: 'Qingdao University',
      zodiac: 'Aries',
      mbti: 'INFP',
      traits: ['curious', 'patient'],
      interestTags: ['running', 'coffee'],
      availableTimes: ['weekend'],
      wantToMeet: ['same-school women'],
      preferredTraits: ['same-school women'],
      rejectRules: 'No late night first meetups',
      privacyBoundary: 'No phone number before meeting',
      matchSignals: expect.objectContaining({
        agentProfileMemory: expect.objectContaining({
          height: '181cm',
          weight: '70kg',
          school: 'Qingdao University',
          targetPreference: 'same-school women',
        }),
        sourceMessage:
          'I am an Aries male studying in Qingdao University and want running friends.',
        updatedAt: expect.any(String),
      }),
    });
    expect(patch.updatedFields).toEqual(
      expect.arrayContaining([
        'gender',
        'city',
        'traits',
        'availableTimes',
        'wantToMeet',
        'matchSignals',
      ]),
    );
    expect(patch.memoryFields).toEqual(
      expect.arrayContaining([
        'height',
        'weight',
        'school',
        'targetPreference',
      ]),
    );
    expect(patch.missingFields).toEqual([]);
  });

  it('reports missing product-critical profile fields when context is sparse', () => {
    const patch = buildSocialAgentProfileContextPatch({
      extractedProfile: {
        city: 'Shanghai',
      },
    });

    expect(patch.dto).toEqual({ city: 'Shanghai' });
    expect(patch.updatedFields).toEqual(['city']);
    expect(patch.memoryFields).toEqual([]);
    expect(patch.missingFields).toEqual([
      'availableTimes',
      'privacyBoundary',
      'interestTags',
      'wantToMeet',
    ]);
  });

  it('falls back to an empty patch when extractedProfile is not an object', () => {
    const patch = buildSocialAgentProfileContextPatch({
      extractedProfile: ['city: Qingdao'],
      sourceMessage: '   ',
    });

    expect(patch.dto).toEqual({});
    expect(patch.extractedProfile).toEqual({});
    expect(patch.sourceMessage).toBe('');
    expect(patch.updatedFields).toEqual([]);
  });
});
