import { AgentSelfImproveService } from './agent-self-improve.service';
import {
  AgentEvalCase,
  AgentReflectionRun,
  AgentSkillPatch,
} from './entities/agent-self-improve.entity';

describe('AgentSelfImproveService', () => {
  const makeRepo = <T extends object>() => ({
    create: jest.fn((value: Partial<T>) => value),
    save: jest.fn((value: Partial<T>) => Promise.resolve({ id: 11, ...value })),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
  });

  it('records failed quality checks as a reflection and regression eval case', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    const patchRepo = makeRepo<AgentSkillPatch>();
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
    );

    const reflection = await service.recordQualityFailure({
      taskId: 42,
      ownerUserId: 7,
      assistantMessage:
        'traceId abc leaked into the user-facing message and should be fixed',
      source: 'spec',
      context: { candidateCount: 1 },
      qualityReport: {
        passed: false,
        score: 50,
        suggestions: ['用户可见内容不能出现 traceId'],
        checks: [
          {
            id: 'user_facing_tone',
            status: 'fail',
            message: '用户可见内容里不能出现技术词。',
            evidence: ['traceId: traceId abc'],
          },
          {
            id: 'approval_gate',
            status: 'pass',
            message: '高风险动作都保留了用户确认门禁。',
          },
        ],
      },
    });

    expect(reflection).toEqual(
      expect.objectContaining({
        id: 11,
        agentTaskId: 42,
        ownerUserId: 7,
        severity: 'high',
        status: 'queued',
      }),
    );
    expect(reflectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityScore: 50,
        failedChecks: [
          {
            id: 'user_facing_tone',
            message: '用户可见内容里不能出现技术词。',
            evidence: ['traceId: traceId abc'],
          },
        ],
      }),
    );
    expect(evalCaseRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reflectionRunId: 11,
        agentTaskId: 42,
        status: 'active',
        expectedBehavior: expect.objectContaining({
          minScore: 90,
          mustPassChecks: ['user_facing_tone'],
        }),
      }),
    );
  });

  it('moves a skill patch through evaluation, approval, publish, and rollback', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    (reflectionRepo.findOne as jest.Mock).mockResolvedValue({
      id: 21,
      ownerUserId: 7,
      agentTaskId: 42,
    } as AgentReflectionRun);
    const patchRepo = makeRepo<AgentSkillPatch>();
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    (evalCaseRepo.find as jest.Mock).mockResolvedValue([
      { id: 31, reflectionRunId: 21 } as AgentEvalCase,
    ]);
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
    );

    await service.createSkillPatch({
      reflectionRunId: 21,
      patchType: 'prompt',
      title: 'Tighten final response safety',
      target: 'final_response.system_prompt',
      patch: { appendRule: 'Never expose trace ids.' },
    });
    expect(patchRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reflectionRunId: 21,
        status: 'draft',
        patchType: 'prompt',
      }),
    );

    (patchRepo.findOne as jest.Mock).mockResolvedValueOnce({
      id: 11,
      reflectionRunId: 21,
      status: 'draft',
      patch: {},
      evalCaseIds: [],
    } as unknown as AgentSkillPatch);
    const evaluated = await service.evaluateSkillPatch(11, {
      result: { score: 96, passed: true },
    });
    expect(evaluated).toEqual(
      expect.objectContaining({
        status: 'pending_review',
        evalCaseIds: [31],
      }),
    );

    (patchRepo.findOne as jest.Mock).mockResolvedValueOnce({
      id: 11,
      status: 'pending_review',
      patch: { lastEvaluation: { evaluatedAt: new Date().toISOString() } },
      evalCaseIds: [31],
    } as unknown as AgentSkillPatch);
    const approved = await service.approveSkillPatch(11, 7);
    expect(approved).toEqual(
      expect.objectContaining({
        status: 'approved',
        reviewedByUserId: 7,
      }),
    );

    (patchRepo.findOne as jest.Mock).mockResolvedValueOnce({
      id: 11,
      status: 'approved',
      patch: { lastEvaluation: { evaluatedAt: new Date().toISOString() } },
      evalCaseIds: [31],
      reviewedByUserId: 7,
    } as unknown as AgentSkillPatch);
    const published = await service.publishSkillPatch(11, 7);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeInstanceOf(Date);

    (patchRepo.findOne as jest.Mock).mockResolvedValueOnce({
      id: 11,
      status: 'published',
      patch: {},
    } as unknown as AgentSkillPatch);
    const rolledBack = await service.rollbackSkillPatch(11, 7, 'bad eval');
    expect(rolledBack).toEqual(
      expect.objectContaining({
        status: 'rolled_back',
        patch: expect.objectContaining({
          rollback: expect.objectContaining({
            byUserId: 7,
            reason: 'bad eval',
          }),
        }),
      }),
    );
  });

  it('reads published prompt rules for runtime prompt injection', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    const patchRepo = makeRepo<AgentSkillPatch>();
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    (patchRepo.find as jest.Mock).mockResolvedValue([
      {
        status: 'published',
        patchType: 'prompt',
        target: 'final_response.system_prompt',
        patch: {
          appendRule: 'Never expose trace ids.',
          rules: [
            'Ask one concise follow-up when profile details are missing.',
          ],
        },
      } as unknown as AgentSkillPatch,
    ]);
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
    );

    await expect(
      service.publishedPromptRules('final_response.system_prompt'),
    ).resolves.toEqual([
      'Never expose trace ids.',
      'Ask one concise follow-up when profile details are missing.',
    ]);
    expect(patchRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'published',
          patchType: 'prompt',
          target: 'final_response.system_prompt',
        },
      }),
    );
  });

  it('runs eval cases automatically and clusters reflection failures', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    (reflectionRepo.find as jest.Mock).mockResolvedValue([
      {
        id: 1,
        triggerType: 'quality_failed',
        severity: 'high',
        failedChecks: [{ id: 'user_facing_tone' }],
      },
      {
        id: 2,
        triggerType: 'quality_failed',
        severity: 'medium',
        failedChecks: [{ id: 'user_facing_tone' }],
      },
    ]);
    const patchRepo = makeRepo<AgentSkillPatch>();
    (patchRepo.findOne as jest.Mock).mockResolvedValue({
      id: 11,
      reflectionRunId: 21,
      status: 'pending_review',
      patchType: 'prompt',
      target: 'final_response.system_prompt',
      rationale: 'Avoid user-facing internal trace leakage.',
      patch: { appendRule: 'Never expose trace ids to users.' },
      evalCaseIds: [],
    } as unknown as AgentSkillPatch);
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    (evalCaseRepo.find as jest.Mock).mockResolvedValue([
      {
        id: 31,
        title: 'No trace ids',
        expectedBehavior: {
          minScore: 90,
          mustPassChecks: ['user_facing_tone'],
        },
      } as unknown as AgentEvalCase,
    ]);
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
    );

    const approved = await service.approveSkillPatch(11, 7);
    expect(approved).toEqual(
      expect.objectContaining({
        status: 'approved',
        patch: expect.objectContaining({
          lastEvaluation: expect.objectContaining({
            runner: 'fitmeet_agent_eval_runner_v1',
            passed: true,
            evalCaseIds: [31],
          }),
        }),
      }),
    );

    await expect(service.clusterReflectionFailures()).resolves.toEqual([
      expect.objectContaining({
        key: 'user_facing_tone',
        count: 2,
        severity: 'high',
        suggestedPatchType: 'prompt',
      }),
    ]);
  });

  it('uses online replay samples during eval and reconciles canary metrics', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    const patchRepo = makeRepo<AgentSkillPatch>();
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    const replaySample = {
      id: 81,
      expectedBehavior: { mustNotRegress: ['internal'] },
    };
    const l5Runtime = {
      replaySamplesForEvalCases: jest.fn().mockResolvedValue([replaySample]),
      recordReplayResult: jest.fn().mockResolvedValue(undefined),
      recordPatchEffect: jest.fn().mockResolvedValue(undefined),
      recentPatchEffects: jest
        .fn()
        .mockResolvedValue([
          { metric: 'quality_score', value: 0.95, sampleSize: 30 },
        ]),
      decideCanary: jest.fn().mockReturnValue('promote'),
    };
    (patchRepo.findOne as jest.Mock)
      .mockResolvedValueOnce({
        id: 11,
        reflectionRunId: 21,
        status: 'draft',
        patchType: 'prompt',
        target: 'final_response.system_prompt',
        patch: { appendRule: 'Keep user-facing output clean.' },
        evalCaseIds: [],
      } as unknown as AgentSkillPatch)
      .mockResolvedValueOnce({
        id: 11,
        status: 'published',
        patch: {
          rollout: { state: 'canary', percent: 10 },
          lastEvaluation: { evaluatedAt: new Date().toISOString() },
        },
        evalCaseIds: [31],
      } as unknown as AgentSkillPatch);
    (evalCaseRepo.find as jest.Mock).mockResolvedValue([
      {
        id: 31,
        title: 'Replay-backed case',
        expectedBehavior: { minScore: 80, mustPassChecks: [] },
      } as unknown as AgentEvalCase,
    ]);
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
      l5Runtime as never,
    );

    const evaluated = await service.runSkillPatchEval(11, {
      evalCaseIds: [31],
    });
    expect(evaluated.patch.lastEvaluation).toEqual(
      expect.objectContaining({
        replayResults: [
          expect.objectContaining({
            replaySampleId: 81,
            passed: true,
          }),
        ],
      }),
    );
    expect(l5Runtime.recordReplayResult).toHaveBeenCalled();

    const reconciled = await service.reconcileCanaryPatch(11);
    expect(reconciled.decision).toBe('promote');
    expect(reconciled.patch.patch.rollout).toEqual(
      expect.objectContaining({ state: 'stable', percent: 100 }),
    );
    expect(l5Runtime.recordPatchEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        patchId: 11,
        metric: 'canary_decision',
        decision: 'promote',
      }),
    );
  });

  it('discovers automation clusters from online replay and canary metrics', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    const patchRepo = makeRepo<AgentSkillPatch>();
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    const l5Runtime = {
      listReplaySamples: jest.fn().mockResolvedValue([
        {
          id: 81,
          agentTaskId: 42,
          lastReplay: { passed: false, score: 62 },
        },
      ]),
      listPatchEffects: jest.fn().mockResolvedValue([
        {
          patchId: 11,
          metric: 'quality_drop',
          value: 0.12,
          sampleSize: 25,
        },
      ]),
      listSubagentMemory: jest.fn().mockResolvedValue([
        {
          id: 91,
          agentName: 'Social Match Agent',
          memoryScope: 'matching.worker_memory',
          critique: {
            failureReview: {
              required: true,
              clusterKey: 'social-match-agent:recall-zero-candidates',
            },
          },
        },
      ]),
    };
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
      l5Runtime as never,
    );

    await expect(service.discoverAutomationClusters()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'online_replay_regression',
          source: 'online_replay',
          count: 1,
        }),
        expect.objectContaining({
          key: 'canary_metric_regression',
          source: 'canary_metrics',
          severity: 'high',
        }),
        expect.objectContaining({
          key: 'social-match-agent:recall-zero-candidates',
          source: 'subagent_memory',
          count: 1,
        }),
      ]),
    );
  });

  it('auto-generates, evals, and canary-publishes low-risk patches', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    (reflectionRepo.find as jest.Mock).mockResolvedValue([
      {
        id: 1,
        triggerType: 'quality_failed',
        severity: 'low',
        failedChecks: [{ id: 'user_facing_tone' }],
      },
    ]);
    (reflectionRepo.findOne as jest.Mock).mockResolvedValue({
      id: 1,
    } as AgentReflectionRun);
    const patchRepo = makeRepo<AgentSkillPatch>();
    (patchRepo.findOne as jest.Mock)
      .mockResolvedValueOnce({
        id: 11,
        reflectionRunId: 1,
        status: 'draft',
        patchType: 'prompt',
        target: 'final_response.system_prompt',
        rationale: 'auto',
        patch: {
          appendRule: 'Never expose trace ids.',
          autoRunner: { clusterKey: 'user_facing_tone' },
        },
        evalCaseIds: [11],
        riskLevel: 'low',
      } as unknown as AgentSkillPatch)
      .mockResolvedValueOnce({
        id: 11,
        reflectionRunId: 1,
        status: 'approved',
        patchType: 'prompt',
        target: 'final_response.system_prompt',
        patch: {
          lastEvaluation: {
            evaluatedAt: new Date().toISOString(),
            passed: true,
          },
        },
        evalCaseIds: [11],
        reviewedByUserId: 7,
      } as unknown as AgentSkillPatch);
    (patchRepo.find as jest.Mock).mockResolvedValue([]);
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    (evalCaseRepo.find as jest.Mock).mockResolvedValue([
      {
        id: 11,
        title: 'Auto eval: user_facing_tone',
        expectedBehavior: {
          minScore: 85,
          mustPassChecks: ['user_facing_tone'],
        },
      } as unknown as AgentEvalCase,
    ]);
    const l5Runtime = {
      listReplaySamples: jest.fn().mockResolvedValue([]),
      listPatchEffects: jest.fn().mockResolvedValue([]),
      replaySamplesForEvalCases: jest.fn().mockResolvedValue([]),
    };
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
      l5Runtime as never,
    );

    const result = await service.runAutomationOnce(7);

    expect(result.createdPatchIds).toEqual([11]);
    expect(result.evaluatedPatchIds).toEqual([11]);
    expect(result.autoPublishedPatchIds).toEqual([11]);
    expect(evalCaseRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        caseType: 'auto_reflection',
        title: 'Auto eval: user_facing_tone',
      }),
    );
    expect(patchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        patch: expect.objectContaining({
          rollout: expect.objectContaining({
            state: 'canary',
          }),
        }),
      }),
    );
  });

  it('keeps high-risk auto patches in review after eval', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    (reflectionRepo.find as jest.Mock).mockResolvedValue([
      {
        id: 1,
        triggerType: 'quality_failed',
        severity: 'high',
        failedChecks: [{ id: 'approval_gate' }],
      },
    ]);
    (reflectionRepo.findOne as jest.Mock).mockResolvedValue({
      id: 1,
    } as AgentReflectionRun);
    const patchRepo = makeRepo<AgentSkillPatch>();
    (patchRepo.findOne as jest.Mock).mockResolvedValue({
      id: 11,
      reflectionRunId: 1,
      status: 'draft',
      patchType: 'safety_policy',
      target: 'scene_risk',
      rationale: 'auto',
      patch: {
        requireConfirmation: true,
        safetyPrompt: 'confirm first',
        autoRunner: { clusterKey: 'approval_gate' },
      },
      evalCaseIds: [11],
      riskLevel: 'high',
    } as unknown as AgentSkillPatch);
    (patchRepo.find as jest.Mock).mockResolvedValue([]);
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    (evalCaseRepo.find as jest.Mock).mockResolvedValue([
      {
        id: 11,
        title: 'Auto eval: approval_gate',
        expectedBehavior: {
          minScore: 85,
          mustPassChecks: ['approval_gate'],
        },
      } as unknown as AgentEvalCase,
    ]);
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
      {
        listReplaySamples: jest.fn().mockResolvedValue([]),
        listPatchEffects: jest.fn().mockResolvedValue([]),
        replaySamplesForEvalCases: jest.fn().mockResolvedValue([]),
      } as never,
    );

    const result = await service.runAutomationOnce(7);

    expect(result.pendingReviewPatchIds).toEqual([11]);
    expect(result.autoPublishedPatchIds).toEqual([]);
    expect(patchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending_review',
        patch: expect.objectContaining({
          autoRunner: expect.objectContaining({
            stage: 'pending_human_review',
          }),
        }),
      }),
    );
  });

  it('classifies Life Graph sensitive patches as human-review gated', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    const patchRepo = makeRepo<AgentSkillPatch>();
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
    );

    await service.createSkillPatch({
      patchType: 'life_graph_extraction',
      title: 'Merge sensitive Life Graph memory',
      target: 'profile_extraction.system_prompt',
      riskLevel: 'low',
      patch: {
        appendRule:
          'Merge precise_location and phone number memories after extraction.',
      },
    });

    expect(patchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        riskLevel: 'high',
        patch: expect.objectContaining({
          selfImproveControl: expect.objectContaining({
            domain: 'life_graph_agent',
            requiresHumanReview: true,
            autoCanaryAllowed: false,
            reasons: expect.arrayContaining([
              'high_risk_social_or_privacy_surface',
            ]),
          }),
        }),
      }),
    );
  });

  it('rejects high-risk patch publishing without recorded human review', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    const patchRepo = makeRepo<AgentSkillPatch>();
    (patchRepo.findOne as jest.Mock).mockResolvedValue({
      id: 11,
      status: 'approved',
      patchType: 'tool_policy',
      target: 'tool:send_message',
      rationale: 'Change send message policy',
      patch: {
        forceRequiresApproval: true,
        lastEvaluation: {
          evaluatedAt: new Date().toISOString(),
          passed: true,
        },
      },
      evalCaseIds: [31],
      reviewedByUserId: null,
      riskLevel: 'low',
    } as unknown as AgentSkillPatch);
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
    );

    await expect(service.publishSkillPatch(11, 7)).rejects.toThrow(
      'high_risk_social_or_privacy_surface',
    );
  });

  it('automatically rolls back canary patches when online metrics regress', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    const patchRepo = makeRepo<AgentSkillPatch>();
    (patchRepo.findOne as jest.Mock).mockResolvedValue({
      id: 11,
      status: 'published',
      patch: {
        autoRunner: { clusterKey: 'canary_metric_regression' },
        rollout: { state: 'canary', percent: 10 },
      },
      evalCaseIds: [31],
    } as unknown as AgentSkillPatch);
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    const l5Runtime = {
      recentPatchEffects: jest
        .fn()
        .mockResolvedValue([
          { metric: 'quality_drop', value: 0.12, sampleSize: 30 },
        ]),
      decideCanary: jest.fn().mockReturnValue('rollback'),
      recordPatchEffect: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
      l5Runtime as never,
    );

    const result = await service.reconcileCanaryPatch(11);

    expect(result.decision).toBe('rollback');
    expect(result.patch).toEqual(
      expect.objectContaining({
        status: 'rolled_back',
        patch: expect.objectContaining({
          autoRunner: expect.objectContaining({
            stage: 'auto_rolled_back',
          }),
          rollout: expect.objectContaining({
            state: 'rolled_back',
          }),
        }),
      }),
    );
    expect(l5Runtime.recordPatchEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleSize: 30,
        decision: 'rollback',
      }),
    );
  });

  it('reconciles canary from patch-local online effects without L5 runtime', async () => {
    const reflectionRepo = makeRepo<AgentReflectionRun>();
    const patchRepo = makeRepo<AgentSkillPatch>();
    (patchRepo.findOne as jest.Mock).mockResolvedValue({
      id: 11,
      status: 'published',
      patch: {
        onlineEffects: [
          { metric: 'quality_drop', value: 0.11, sampleSize: 25 },
        ],
        rollout: { state: 'canary', percent: 10 },
      },
    } as unknown as AgentSkillPatch);
    const evalCaseRepo = makeRepo<AgentEvalCase>();
    const service = new AgentSelfImproveService(
      reflectionRepo as never,
      patchRepo as never,
      evalCaseRepo as never,
    );

    const result = await service.reconcileCanaryPatch(11);

    expect(result.decision).toBe('rollback');
    expect(result.patch.status).toBe('rolled_back');
  });
});
