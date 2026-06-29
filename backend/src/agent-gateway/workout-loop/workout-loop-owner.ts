import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import type { WorkoutLoopStage } from './workout-loop.types';

const ACTIVE_WORKOUT_LOOP_STAGES = new Set<WorkoutLoopStage>([
  'intake',
  'clarifying',
  'draft_ready',
  'publish_confirming',
  'published',
  'matching_queued',
  'candidates_ready',
  'no_candidates',
  'no_candidates_final',
  'opener_ready',
  'message_confirming',
  'messages_handoff',
]);

const WORKOUT_EXIT_PATTERN = /取消|先不约|不约了|退出约练|换个话题/;

export function readWorkoutLoopStage(task: AgentTask): WorkoutLoopStage | null {
  const memory = record(task.memory);
  const workoutLoop = record(memory.workoutLoop);
  const stage = cleanDisplayText(workoutLoop.stage, '').trim();
  return ACTIVE_WORKOUT_LOOP_STAGES.has(stage as WorkoutLoopStage)
    ? (stage as WorkoutLoopStage)
    : null;
}

export function workoutLoopOwnsTask(task: AgentTask, message: string): boolean {
  if (!readWorkoutLoopStage(task)) return false;
  const text = cleanDisplayText(message, '');
  return !WORKOUT_EXIT_PATTERN.test(text);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
