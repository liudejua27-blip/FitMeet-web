import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import type { TravelLoopStage } from './travel-loop.types';

const ACTIVE_TRAVEL_LOOP_STAGES = new Set<TravelLoopStage>([
  'intake',
  'draft_ready',
  'matching_queued',
  'candidates_ready',
  'opener_ready',
  'message_confirming',
  'messages_handoff',
]);

const TRAVEL_EXIT_PATTERN =
  /取消|先不旅游|不旅行了|不旅游了|退出旅游|退出旅行|换个话题/;

export function readTravelLoopStage(task: AgentTask): TravelLoopStage | null {
  const memory = record(task.memory);
  const travelLoop = record(memory.travelLoop);
  const stage = cleanDisplayText(travelLoop.stage, '').trim();
  return ACTIVE_TRAVEL_LOOP_STAGES.has(stage as TravelLoopStage)
    ? (stage as TravelLoopStage)
    : null;
}

export function travelLoopOwnsTask(task: AgentTask, message: string): boolean {
  if (!readTravelLoopStage(task)) return false;
  const text = cleanDisplayText(message, '');
  return !TRAVEL_EXIT_PATTERN.test(text);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
