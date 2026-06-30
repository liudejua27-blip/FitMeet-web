import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import type { FriendLoopStage } from './friend-loop.types';

const ACTIVE_FRIEND_LOOP_STAGES = new Set<FriendLoopStage>([
  'intake',
  'draft_ready',
  'matching_queued',
  'candidates_ready',
  'opener_ready',
  'message_confirming',
  'messages_handoff',
]);

const FRIEND_EXIT_PATTERN = /取消|先不交友|不交友了|退出交友|换个话题/;

export function readFriendLoopStage(task: AgentTask): FriendLoopStage | null {
  const memory = record(task.memory);
  const friendLoop = record(memory.friendLoop);
  const stage = cleanDisplayText(friendLoop.stage, '').trim();
  return ACTIVE_FRIEND_LOOP_STAGES.has(stage as FriendLoopStage)
    ? (stage as FriendLoopStage)
    : null;
}

export function friendLoopOwnsTask(task: AgentTask, message: string): boolean {
  if (!readFriendLoopStage(task)) return false;
  const text = cleanDisplayText(message, '');
  return !FRIEND_EXIT_PATTERN.test(text);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
