import { AgentSocialRequestAdapter } from './agent-social-request.adapter';
import {
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from './social-request.entity';

function makeAdapter() {
  const socialRequests = {
    create: jest.fn(),
    findOwn: jest.fn(),
  };
  const matches = {
    runMatch: jest.fn().mockResolvedValue({ candidates: [] }),
  };
  const repo = {
    findOne: jest.fn(),
  };
  const candidateRepo = {
    findOne: jest.fn(),
  };
  const logRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const messages = {
    createAgentMessageEvent: jest.fn(),
  };
  const adapter = new AgentSocialRequestAdapter(
    socialRequests as never,
    matches as never,
    repo as never,
    candidateRepo as never,
    logRepo as never,
    messages as never,
  );
  return { adapter, socialRequests, matches, repo };
}

describe('AgentSocialRequestAdapter', () => {
  it('preserves legacy agent time and location context in canonical metadata', async () => {
    const harness = makeAdapter();
    const savedRequest = {
      id: 301,
      userId: 7,
      agentId: null,
      type: SocialRequestType.CityWalk,
      title: '今晚青岛大学散步',
      description: '想找人今晚在青岛大学附近散步',
      rawText: '想找人今晚在青岛大学附近散步',
      city: '青岛',
      lat: null,
      lng: null,
      radiusKm: 5,
      timeStart: null,
      timeEnd: null,
      activityType: '散步',
      safetyRequirement: null,
      requireUserConfirmation: true,
      visibility: SocialRequestVisibility.Public,
      status: UserSocialRequestStatus.Matching,
      interestTags: ['散步', '舞蹈'],
      metadata: {
        timePreference: '今天晚上',
        locationPreference: '青岛大学附近',
        nearbyArea: '青岛大学附近',
      },
      createdAt: new Date('2026-06-20T00:00:00.000Z'),
      updatedAt: new Date('2026-06-20T00:00:00.000Z'),
    };
    harness.socialRequests.create.mockResolvedValue(savedRequest);
    harness.repo.findOne.mockResolvedValue(savedRequest);

    const result = await harness.adapter.createFromLegacy(
      7,
      {
        requestType: '散步',
        title: '今晚青岛大学散步',
        description: '想找人今晚在青岛大学附近散步',
        city: '青岛',
        loc: '青岛大学附近',
        timePreference: '今天晚上',
        visibility: 'public',
        verifiedOnly: true,
        interests: ['散步', '舞蹈'],
      },
      null,
    );

    expect(harness.socialRequests.create).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: SocialRequestType.CityWalk,
        city: '青岛',
        metadata: expect.objectContaining({
          legacyAgentRequest: true,
          originalRequestType: '散步',
          timePreference: '今天晚上',
          locationPreference: '青岛大学附近',
          nearbyArea: '青岛大学附近',
          verifiedOnly: true,
          taskSlotSummary: expect.objectContaining({
            activity: '散步',
            time_window: '今天晚上',
            location_text: '青岛大学附近',
            geo_area: '青岛',
          }),
          knownTaskSlotConstraints: expect.objectContaining({
            source: 'legacy_agent_social_request',
            taskSlotsAreHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'activity',
              'time_window',
              'location_text',
              'geo_area',
            ]),
          }),
        }),
      }),
      { agent: null },
    );
    expect(harness.matches.runMatch).toHaveBeenCalledWith(301, 7, {
      limit: 10,
    });
    expect(result.request).toEqual(
      expect.objectContaining({
        loc: '青岛大学附近',
        timePreference: '今天晚上',
      }),
    );
  });
});
