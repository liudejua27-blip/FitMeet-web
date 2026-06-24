import { SocialAgentTokenBudgetContextPackerService } from './social-agent-token-budget-context-packer.service';

function makeConfig(values: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('SocialAgentTokenBudgetContextPackerService', () => {
  it('packs final response context into a bounded model payload', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService(
      makeConfig({
        SOCIAL_AGENT_FINAL_RESPONSE_CONTEXT_TURN_LIMIT: '20',
      }) as never,
    );

    const { payload, promptBudget } = packer.packFinalResponseInput({
      userMessage: '继续帮我找人',
      intent: 'social_search',
      conversationHistory: [
        { role: 'assistant', text: '正在理解你的需求' },
        ...Array.from({ length: 30 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          text: `history-${index + 1}`,
        })),
      ],
      taskContext: {
        taskSlots: {
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          activity: { value: '散步', state: 'completed' },
        },
        traceId: 'trace-should-drop',
        rawPayload: { huge: 'raw should drop' },
      },
      plannerDecision: {
        intent: 'social_search',
        responseGoal: '搜索候选',
        rawJson: { shouldDrop: true },
      },
      toolResults: Array.from({ length: 20 }, (_, index) => ({
        index,
        name: 'candidate_search',
        rawResponse: { shouldDrop: true },
      })),
      fallbackReply: '我会继续。',
    });

    expect(promptBudget).toMatchObject({
      policy: 'token_budget_context_packer_v1',
      conversationTurns: 20,
      contextTurnLimit: 20,
      promptPrefixHash: null,
      dynamicContextHash: expect.stringMatching(/^[a-f0-9]{24}$/),
    });
    expect(payload.promptBudget).toEqual(promptBudget);
    expect(payload.conversationHistory).toHaveLength(20);
    expect(JSON.stringify(payload)).not.toContain('trace-should-drop');
    expect(JSON.stringify(payload)).not.toContain('raw should drop');
    expect(JSON.stringify(payload)).not.toContain('shouldDrop');
    expect(payload.knownTaskSlotConstraints).toMatchObject({
      treatAsHardConstraints: true,
      doNotAskAgainFor: expect.arrayContaining([
        'time_window',
        'location_text',
        'activity',
      ]),
    });
    expect(payload.toolResults).toHaveLength(12);
  });

  it('creates stable prompt fingerprints for prefix-cache observability', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService();
    const baseInput = {
      userMessage: '继续帮我找人',
      intent: 'social_search',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
        },
      },
      fallbackReply: '我会继续。',
    };

    const first = packer.packFinalResponseInput(baseInput, {
      promptPrefix: 'stable system prompt',
    }).promptBudget;
    const second = packer.packFinalResponseInput(baseInput, {
      promptPrefix: 'stable system prompt',
    }).promptBudget;
    const changedDynamic = packer.packFinalResponseInput(
      { ...baseInput, userMessage: '明天晚上继续帮我找人' },
      { promptPrefix: 'stable system prompt' },
    ).promptBudget;
    const changedPrefix = packer.packFinalResponseInput(baseInput, {
      promptPrefix: 'changed system prompt',
    }).promptBudget;

    expect(first.promptPrefixHash).toMatch(/^[a-f0-9]{24}$/);
    expect(first.dynamicContextHash).toMatch(/^[a-f0-9]{24}$/);
    expect(second.promptPrefixHash).toBe(first.promptPrefixHash);
    expect(second.dynamicContextHash).toBe(first.dynamicContextHash);
    expect(changedDynamic.promptPrefixHash).toBe(first.promptPrefixHash);
    expect(changedDynamic.dynamicContextHash).not.toBe(
      first.dynamicContextHash,
    );
    expect(changedPrefix.promptPrefixHash).not.toBe(first.promptPrefixHash);
    expect(changedPrefix.dynamicContextHash).toBe(first.dynamicContextHash);
  });

  it('enforces a hard approximate prompt budget by trimming optional context', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService(
      makeConfig({
        SOCIAL_AGENT_FINAL_RESPONSE_CONTEXT_TURN_LIMIT: '80',
        SOCIAL_AGENT_FINAL_RESPONSE_MAX_PROMPT_CHARS: '5000',
      }) as never,
    );

    const longText = '这是一段用于模拟长对话和工具上下文的文本。'.repeat(80);
    const { payload, promptBudget } = packer.packFinalResponseInput({
      userMessage: '继续帮我找人',
      intent: 'social_search',
      conversationHistory: Array.from({ length: 80 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: `${index}:${longText}`,
      })),
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
      memoryContext: {
        lifeGraphSummary: {
          facts: Array.from({ length: 20 }, (_, index) => ({
            key: `fact-${index}`,
            value: longText,
          })),
        },
      },
      searchResults: {
        candidates: Array.from({ length: 10 }, (_, index) => ({
          candidateRecordId: index + 1,
          displayName: `候选 ${index + 1}`,
          matchReasons: [longText],
        })),
        activityResults: Array.from({ length: 10 }, (_, index) => ({
          activityId: `activity-${index + 1}`,
          title: `活动 ${index + 1}`,
          reasons: [longText],
        })),
      },
      toolResults: Array.from({ length: 12 }, (_, index) => ({
        name: 'search_public_candidates',
        status: 'done',
        output: {
          candidates: [
            {
              candidateRecordId: index + 100,
              displayName: `工具候选 ${index + 1}`,
              matchReasons: [longText],
            },
          ],
        },
      })),
      fallbackReply: '我会继续。',
    });

    expect(promptBudget.maxApproxPromptChars).toBe(5000);
    expect(promptBudget.approxPromptChars).toBeLessThanOrEqual(5000);
    expect(promptBudget.budgetApplied).toBe(true);
    expect(promptBudget.truncatedSections).toEqual(
      expect.arrayContaining([
        'conversationHistory:last12',
        'toolResults:last6',
      ]),
    );
    expect(
      (payload.conversationHistory as Array<Record<string, unknown>>).length,
    ).toBeLessThanOrEqual(12);
    expect(payload.knownTaskSlotConstraints).toMatchObject({
      doNotAskAgainFor: expect.arrayContaining([
        'activity',
        'time_window',
        'location_text',
      ]),
    });
  });

  it('uses strict context mode for adaptive cost control', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService();

    const { promptBudget, payload } = packer.packFinalResponseInput(
      {
        userMessage: '继续帮我找人',
        intent: 'social_search',
        conversationHistory: Array.from({ length: 40 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          text: `history-${index + 1}`,
        })),
        fallbackReply: '继续',
      },
      { budgetMode: 'strict' },
    );

    expect(promptBudget).toMatchObject({
      budgetMode: 'strict',
      contextTurnLimit: 8,
      maxApproxPromptChars: 12000,
    });
    expect(payload.conversationHistory).toHaveLength(8);
  });

  it('can force strict context mode from config', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService(
      makeConfig({
        SOCIAL_AGENT_FINAL_RESPONSE_CONTEXT_BUDGET_MODE: 'strict',
        SOCIAL_AGENT_FINAL_RESPONSE_STRICT_CONTEXT_TURN_LIMIT: '6',
        SOCIAL_AGENT_FINAL_RESPONSE_STRICT_MAX_PROMPT_CHARS: '9000',
      }) as never,
    );

    const { promptBudget, payload } = packer.packFinalResponseInput({
      userMessage: '继续帮我找人',
      conversationHistory: Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: `history-${index + 1}`,
      })),
      fallbackReply: '继续',
    });

    expect(promptBudget).toMatchObject({
      budgetMode: 'strict',
      contextTurnLimit: 6,
      maxApproxPromptChars: 9000,
    });
    expect(payload.conversationHistory).toHaveLength(6);
  });

  it('exposes known slots for fallback de-duplication', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService();

    expect(
      packer.knownSlots({
        userMessage: '继续',
        taskContext: {
          taskSlots: {
            candidate_preference: {
              value: '女生、舞蹈相关',
              state: 'answered',
            },
          },
        },
        fallbackReply: '继续',
      }),
    ).toEqual({
      candidate_preference: '女生、舞蹈相关',
    });
  });

  it('summarizes candidate search results before sending them to the final response model', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService();
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      candidateRecordId: 500 + index,
      targetUserId: 900 + index,
      displayName: `候选 ${index + 1}`,
      city: '青岛',
      locationText: '青岛大学附近',
      matchScore: 88 - index,
      interestTags: ['散步', '编程', '舞蹈', 'Citywalk', '咖啡', '羽毛球'],
      matchReasons: [
        '同城公开可发现用户',
        '时间偏好接近',
        '低压力活动匹配',
        '公开标签相近',
        '额外长理由会被裁剪',
      ],
      preferenceHistorySignals: ['最近保存过散步搭子', '偏好青岛大学附近'],
      safetyNotes: ['建议白天公共路线', '不公开精确位置', '额外安全提示'],
      suggestedOpener:
        '你好，看到你也喜欢散步和轻松聊天，我想先从青岛大学附近一段短路线开始，你更喜欢安静路线还是边走边聊？',
      scoreBreakdown: {
        behaviorPreference: 16,
        interestSimilarity: 22,
        timeOverlap: 10,
        distance: 6,
        score: 88,
        internalModelScore: 999,
      },
      rawJson: { shouldDrop: true },
      debug: { shouldDrop: true },
      candidateExplanation: {
        verbose:
          '这个解释很长，只用于 UI 或 debug，不应该原样进入最终回复模型。',
      },
      emotionalInsight: '不应该进入最终回复模型',
    }));

    const originalLength = JSON.stringify({ candidates }).length;
    const { payload } = packer.packFinalResponseInput({
      userMessage: '继续帮我找人',
      intent: 'social_search',
      searchResults: {
        candidates,
        traceId: 'trace-should-drop',
        nextStep: 'show_candidates',
      },
      fallbackReply: '我会继续。',
    });

    const searchResults = payload.searchResults as Record<string, unknown>;
    expect(searchResults).toMatchObject({
      summaryPolicy: 'candidate_result_summary_v1',
      totalCandidates: 8,
      nextStep: 'show_candidates',
    });
    expect(searchResults.candidates).toHaveLength(3);
    expect(searchResults.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateRecordId: 500,
          candidateUserId: 900,
          displayName: '候选 1',
          city: '青岛',
          scoreBreakdown: expect.objectContaining({
            behaviorPreference: 16,
            interestSimilarity: 22,
          }),
          preferenceHistorySignals: expect.arrayContaining([
            '最近保存过散步搭子',
          ]),
        }),
      ]),
    );
    const packedJson = JSON.stringify(payload.searchResults);
    expect(packedJson.length).toBeLessThan(originalLength);
    expect(packedJson).not.toContain('trace-should-drop');
    expect(packedJson).not.toContain('shouldDrop');
    expect(packedJson).not.toContain('candidateExplanation');
    expect(packedJson).not.toContain('emotionalInsight');
    expect(packedJson).not.toContain('internalModelScore');
  });

  it('summarizes nested tool candidate and activity results', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService();

    const { payload } = packer.packFinalResponseInput({
      userMessage: '继续',
      toolResults: [
        {
          name: 'search_public_candidates',
          status: 'done',
          output: {
            candidates: [
              {
                candidateRecordId: 701,
                profile: {
                  name: '陈砚',
                  city: '青岛',
                  interestTags: ['散步', '咖啡'],
                },
                scoreBreakdown: { behaviorPreference: 10, distance: 3 },
                rawResponse: { shouldDrop: true },
              },
            ],
            activityResults: [
              {
                id: 'activity-1',
                title: '青岛大学轻松散步',
                timeWindow: '今天晚上',
                tags: ['散步', '低压力'],
                debug: { shouldDrop: true },
              },
            ],
          },
        },
      ],
      fallbackReply: '继续',
    });

    expect(payload.toolResults).toEqual([
      expect.objectContaining({
        name: 'search_public_candidates',
        status: 'done',
        output: expect.objectContaining({
          summaryPolicy: 'candidate_result_summary_v1',
          candidates: [
            expect.objectContaining({
              candidateRecordId: 701,
              displayName: '陈砚',
              city: '青岛',
            }),
          ],
          activityResults: [
            expect.objectContaining({
              activityId: 'activity-1',
              title: '青岛大学轻松散步',
              timeWindow: '今天晚上',
            }),
          ],
        }),
      }),
    ]);
    expect(JSON.stringify(payload.toolResults)).not.toContain('shouldDrop');
  });

  it('summarizes Life Graph, pending approvals, and meet loop context', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService();
    const { payload } = packer.packFinalResponseInput({
      userMessage: '继续推进',
      memoryContext: {
        lifeGraphSummary: {
          preferences: {
            time: '周末下午',
            activity: '低强度散步',
            location: '青岛大学附近',
            socialBoundary: '第一次见面只接受公共场所',
            unusedExtra: '这个字段可以保留摘要但不能扩大成完整对象',
          },
          facts: [
            {
              key: 'activity.walking',
              title: '偏好低强度散步',
              value: '用户多次选择低强度散步作为第一次见面方式',
              confidence: 0.9,
              sensitivity: 'low',
              rawEvidence: { shouldDrop: true },
            },
          ],
          boundaries: ['公共场所优先', '不公开精确位置'],
          evidence: ['来自最近 3 次约练任务'],
          rawPayload: { shouldDrop: true },
        },
        lifeGraphGovernanceSummary: {
          total: 3,
          autoSaveCount: 2,
          confirmationRequiredCount: 1,
          blockedCount: 0,
          sensitiveCount: 1,
          expiringFactKeys: ['old_pref_1', 'old_pref_2'],
          debug: { shouldDrop: true },
        },
      },
      taskContext: {
        pendingApprovals: [
          {
            approvalId: 901,
            actionType: 'send_invite',
            riskLevel: 'medium',
            status: 'pending',
            targetName: '陈砚',
            messagePreview: '你好，想一起散步吗？',
            rawJson: { shouldDrop: true },
          },
        ],
        meetLoopTimeline: {
          currentStage: 'waiting_reply',
          nextAction: '等待对方回复',
          steps: [
            { stage: 'draft', title: '已生成邀请草稿', status: 'done' },
            { stage: 'approval', title: '等待确认发送', status: 'waiting' },
          ],
          rawEvents: [{ shouldDrop: true }],
        },
      },
      fallbackReply: '继续',
    });

    expect(payload.memoryContext).toMatchObject({
      lifeGraphSummary: expect.objectContaining({
        summaryPolicy: 'life_graph_prompt_summary_v1',
        preferences: expect.objectContaining({
          time: '周末下午',
          activity: '低强度散步',
        }),
        facts: [
          expect.objectContaining({
            key: 'activity.walking',
            title: '偏好低强度散步',
          }),
        ],
        boundaries: expect.arrayContaining(['公共场所优先']),
      }),
      lifeGraphGovernanceSummary: expect.objectContaining({
        total: 3,
        confirmationRequiredCount: 1,
      }),
    });
    expect(payload.taskContext).toMatchObject({
      pendingApprovals: [
        expect.objectContaining({
          approvalId: 901,
          actionType: 'send_invite',
          target: '陈砚',
          visibleToOtherUser: '你好，想一起散步吗？',
        }),
      ],
      meetLoopTimeline: expect.objectContaining({
        summaryPolicy: 'meet_loop_prompt_summary_v1',
        currentStage: 'waiting_reply',
        nextAction: '等待对方回复',
        steps: [
          expect.objectContaining({ title: '已生成邀请草稿' }),
          expect.objectContaining({ title: '等待确认发送' }),
        ],
      }),
    });
    const packedJson = JSON.stringify(payload);
    expect(packedJson).not.toContain('shouldDrop');
    expect(packedJson).not.toContain('rawEvents');
  });

  it('summarizes Life Graph, approval, and meet loop tool UI cards', () => {
    const packer = new SocialAgentTokenBudgetContextPackerService();
    const { payload } = packer.packFinalResponseInput({
      userMessage: '确认一下',
      toolResults: [
        {
          schemaType: 'life_graph.diff',
          title: '画像变化',
          data: {
            facts: [{ key: 'boundary.public_place', value: '公共场所优先' }],
            rawPayload: { shouldDrop: true },
          },
        },
        {
          schemaType: 'safety.approval',
          title: '确认发送给陈砚',
          data: {
            approvalId: 902,
            actionType: 'send_invite',
            riskLevel: 'medium',
            visibleToOtherUser: '你好，今天晚上散步方便吗？',
            internal: { shouldDrop: true },
          },
        },
        {
          schemaType: 'meet_loop.timeline',
          title: '邀约进度',
          data: {
            currentStage: 'invited',
            steps: [{ title: '已发送邀请', status: 'done' }],
            rawJson: { shouldDrop: true },
          },
        },
      ],
      fallbackReply: '继续',
    });

    expect(payload.toolResults).toEqual([
      expect.objectContaining({
        summaryPolicy: 'tool_ui_card_summary_v1',
        schemaType: 'life_graph.diff',
        lifeGraph: expect.objectContaining({
          summaryPolicy: 'life_graph_prompt_summary_v1',
        }),
      }),
      expect.objectContaining({
        summaryPolicy: 'tool_ui_card_summary_v1',
        schemaType: 'safety.approval',
        approval: expect.objectContaining({
          approvalId: 902,
          actionType: 'send_invite',
          visibleToOtherUser: '你好，今天晚上散步方便吗？',
        }),
      }),
      expect.objectContaining({
        summaryPolicy: 'tool_ui_card_summary_v1',
        schemaType: 'meet_loop.timeline',
        meetLoopTimeline: expect.objectContaining({
          summaryPolicy: 'meet_loop_prompt_summary_v1',
          currentStage: 'invited',
        }),
      }),
    ]);
    expect(JSON.stringify(payload.toolResults)).not.toContain('shouldDrop');
  });
});
