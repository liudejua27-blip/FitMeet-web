import { Injectable } from '@nestjs/common';

import type { AgentLoopRun, SubagentHandoffResult } from './agent-loop.types';
import { AgentLoopService } from './agent-loop.service';
import type {
  SocialAgentBrainPlannedTool,
  SocialAgentBrainTurnDecision,
} from './social-agent-brain.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import { AgentL5RuntimeService } from './agent-l5-runtime.service';
import { fitMeetAlphaAgentRuntimeBoundary } from './fitmeet-alpha-agent-topology';

type RunSubagentInput = {
  loop: AgentLoopRun;
  ownerUserId?: number | null;
  taskId?: number | null;
  message: string;
  route: SocialAgentIntentRouterResult;
  brainDecision?: SocialAgentBrainTurnDecision;
  observation?: Record<string, unknown>;
};

type RunSubagentResult = {
  loop: AgentLoopRun;
  handoff: SubagentHandoffResult;
};

type HandoffFromObservationInput = Omit<RunSubagentInput, 'loop'>;

type SubagentRuntimeConfig = {
  memoryScope: string;
  maxToolCalls: number;
  maxRetries: number;
  scratchpadPolicy: string;
  critiqueEvaluator: string;
  evalHints: Record<string, unknown>;
};

@Injectable()
export class FitMeetSubagentRuntimeService {
  constructor(
    private readonly agentLoop: AgentLoopService,
    private readonly l5Runtime?: AgentL5RuntimeService,
  ) {}

  run(input: RunSubagentInput): RunSubagentResult {
    const handoff = this.handoffFromObservation(input);
    const agent = this.agentForDecision(input.route, input.brainDecision);
    let loop = this.agentLoop.tool(input.loop, {
      agent,
      toolName:
        handoff.toolCalls[0]?.toolName ??
        this.defaultToolName(agent, input.route),
      toolInput: handoff.plannerInput ?? handoff.input,
      critique: `${agent} owns this turn before handing back to the main agent.`,
      nextPhase: 'observe',
    });
    loop = this.agentLoop.observe(loop, {
      agent,
      toolName:
        handoff.toolCalls[0]?.toolName ??
        this.defaultToolName(agent, input.route),
      observation: handoff.observation,
      critique: handoff.critique,
      nextPhase: 'replan',
    });
    loop = this.agentLoop.replan(loop, {
      agent: 'Agent Brain',
      reason: `handoff_from_${agent.replace(/\s+/g, '_').toLowerCase()}`,
      observation: handoff.observation,
      nextPhase: 'answer',
    });
    return {
      loop,
      handoff,
    };
  }

  handoffFromObservation(
    input: HandoffFromObservationInput,
  ): SubagentHandoffResult {
    const agent = this.agentForDecision(input.route, input.brainDecision);
    const plannedTools = this.plannedToolsFor(agent, input);
    const runtime = this.runtimeFor(agent);
    const executableTools = plannedTools.slice(0, runtime.maxToolCalls);
    const subagentInput = {
      message: input.message,
      intent: input.route.intent,
      replyStrategy: input.route.replyStrategy,
      plannerSource: input.brainDecision?.plannerSource ?? input.route.source,
      memoryScope: runtime.memoryScope,
      toolBudget: {
        maxToolCalls: runtime.maxToolCalls,
        maxRetries: runtime.maxRetries,
        plannedToolCount: plannedTools.length,
      },
      scratchpad: {
        policy: runtime.scratchpadPolicy,
        privateNotes: this.privateScratchpad(agent, input),
      },
    };
    const observation: Record<string, unknown> = {
      agent,
      handledBy: agent,
      intent: input.route.intent,
      branch:
        input.brainDecision?.conversationMode ?? input.route.replyStrategy,
      requiresConfirmation:
        input.brainDecision?.needUserConfirmation ??
        input.route.shouldExecuteAction,
      toolBudget: subagentInput.toolBudget,
      scratchpadPolicy: runtime.scratchpadPolicy,
      ...(input.observation ?? {}),
    };
    const critique = this.critique(agent, observation, runtime);
    const handoff = this.agentLoop.buildHandoff({
      agent,
      memoryScope: runtime.memoryScope,
      input: subagentInput,
      toolNames: executableTools.map((tool) => tool.name),
      observation,
      critique,
      handoffOutput: {
        nextAgent: 'FitMeet Main Agent',
        answerBoundary: this.answerBoundary(agent),
        runtime: {
          maxToolCalls: runtime.maxToolCalls,
          maxRetries: runtime.maxRetries,
          critiqueEvaluator: runtime.critiqueEvaluator,
        },
        observation,
      },
    });
    handoff.toolCalls = plannedTools.map((tool, index) => ({
      toolName: tool.name,
      input: tool.arguments ?? subagentInput,
      status:
        index < runtime.maxToolCalls
          ? Object.keys(observation).length > 0
            ? 'observed'
            : 'planned'
          : 'skipped',
    }));
    handoff.plannerInput = subagentInput;
    handoff.evalHints = {
      ...(handoff.evalHints ?? {}),
      ...runtime.evalHints,
      critiqueEvaluator: runtime.critiqueEvaluator,
      skippedToolCount: Math.max(0, plannedTools.length - runtime.maxToolCalls),
      requiresConfirmation: observation.requiresConfirmation === true,
      hasError: Boolean(observation.error),
    };
    if (input.ownerUserId) {
      void this.l5Runtime?.recordSubagentMemory({
        ownerUserId: input.ownerUserId,
        agentTaskId: input.taskId ?? null,
        agentName: agent,
        memoryScope: handoff.memoryScope ?? runtime.memoryScope,
        input: handoff.input,
        plannerInput: handoff.plannerInput ?? handoff.input,
        toolCalls: handoff.toolCalls,
        observation: handoff.observation,
        observations: handoff.observations ?? [handoff.observation],
        critique: handoff.critique,
        handoffOutput: handoff.handoffOutput,
        evalHints: handoff.evalHints ?? {},
      });
    }
    return handoff;
  }

  agentForDecision(
    route: SocialAgentIntentRouterResult,
    brainDecision?: SocialAgentBrainTurnDecision,
  ): FitMeetAlphaAgentName {
    const mode = brainDecision?.conversationMode;
    if (
      mode === 'profile_enrichment' ||
      mode === 'profile_correction' ||
      mode === 'profile_update_tool' ||
      route.shouldUpdateProfile
    ) {
      return 'Life Graph Agent';
    }
    if (route.intent === 'fitness_math') return 'Agent Brain';
    if (route.intent === 'action_request') return 'Match Agent';
    if (
      route.intent === 'social_search' ||
      route.intent === 'activity_search' ||
      route.intent === 'candidate_followup'
    ) {
      return 'Match Agent';
    }
    return 'Agent Brain';
  }

  private plannedToolsFor(
    agent: FitMeetAlphaAgentName,
    input: HandoffFromObservationInput,
  ): SocialAgentBrainPlannedTool[] {
    const tools = input.brainDecision?.tools ?? [];
    if (tools.length > 0) return tools;
    return [{ name: this.defaultToolName(agent, input.route), arguments: {} }];
  }

  private defaultToolName(
    agent: FitMeetAlphaAgentName,
    route?: SocialAgentIntentRouterResult,
  ): string {
    if (agent === 'Life Graph Agent')
      return 'update_profile_from_agent_context';
    if (agent === 'Match Agent') {
      return route?.intent === 'action_request'
        ? 'meet_loop_state_transition'
        : 'search_real_candidates';
    }
    return route?.intent === 'fitness_math'
      ? 'fitness_math_calculator'
      : 'agent_brain_plan';
  }

  private critique(
    agent: FitMeetAlphaAgentName,
    observation: Record<string, unknown>,
    runtime: SubagentRuntimeConfig,
  ): string {
    if (observation.error) return `${agent} failed; replan before answering.`;
    if (observation.requiresConfirmation) {
      return `${agent} produced an action boundary; wait for user confirmation.`;
    }
    return `${agent} produced a usable observation and can hand off. Evaluator: ${runtime.critiqueEvaluator}.`;
  }

  private answerBoundary(agent: FitMeetAlphaAgentName): string {
    if (agent === 'Life Graph Agent')
      return 'Explain memory changes and ask before sensitive merges.';
    if (agent === 'Match Agent')
      return 'Explain match evidence and expose every side effect as a confirmable state transition.';
    return 'Answer naturally and keep tool state internal.';
  }

  private runtimeFor(agent: FitMeetAlphaAgentName): SubagentRuntimeConfig {
    return fitMeetAlphaAgentRuntimeBoundary(agent);
  }

  private privateScratchpad(
    agent: FitMeetAlphaAgentName,
    input: HandoffFromObservationInput,
  ): Record<string, unknown> {
    return {
      agent,
      routeIntent: input.route.intent,
      plannedToolNames: (input.brainDecision?.tools ?? []).map(
        (tool) => tool.name,
      ),
      handoffBackTo: 'FitMeet Main Agent',
    };
  }
}
