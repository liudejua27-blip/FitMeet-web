import { describe, expect, it } from 'vitest';

import {
  agentApprovalActionLabel,
  agentApprovalEffectText,
  agentApprovalUserFacingText,
  canonicalAgentApprovalActionType,
} from '../lib/agentApprovalCopy';

describe('agentApprovalCopy', () => {
  it('normalizes legacy and Social Codex approval action aliases', () => {
    expect(canonicalAgentApprovalActionType('send_candidate_message')).toBe(
      'send_invite',
    );
    expect(canonicalAgentApprovalActionType('invite_candidate')).toBe(
      'send_invite',
    );
    expect(canonicalAgentApprovalActionType('add_friend')).toBe(
      'connect_candidate',
    );
    expect(canonicalAgentApprovalActionType('post_publish')).toBe(
      'publish_social_request',
    );
    expect(canonicalAgentApprovalActionType('life_graph.accept_update')).toBe(
      'life_graph_writeback',
    );
  });

  it('uses product language instead of raw internal action names', () => {
    const actions = [
      'publish_social_request',
      'send_candidate_message',
      'connect_candidate',
      'exchange_contact',
      'reveal_precise_location',
      'update_sensitive_profile',
      'life_graph_writeback',
    ];

    for (const action of actions) {
      expect(agentApprovalActionLabel(action)).not.toContain('_');
      expect(agentApprovalEffectText(action)).not.toContain(action);
    }

    expect(agentApprovalActionLabel('connect_candidate')).toBe('加好友并聊天');
    expect(agentApprovalActionLabel('send_message')).toBe('发送消息');
    expect(agentApprovalActionLabel('create_activity')).toBe('发布约练');
    expect(agentApprovalActionLabel('life_graph_writeback')).toBe('记住这条偏好');
    expect(agentApprovalEffectText('connect_candidate')).toContain('对方');
    expect(agentApprovalEffectText('connect_candidate')).not.toContain('候选人');
  });

  it('cleans legacy backend approval summaries into user-facing copy', () => {
    expect(agentApprovalUserFacingText('连接候选人之前先确认。')).toBe(
      '加好友并聊天前需要你确认。',
    );
    expect(agentApprovalUserFacingText('确认连接候选人')).toBe('确认加好友并聊天');
    expect(agentApprovalUserFacingText('发送站内消息，并写入长期记忆')).toBe(
      '发送消息，并记住这条偏好',
    );
    expect(agentApprovalUserFacingText('状态已保存，等待保存点继续')).toBe(
      '我会等你确认，确认后继续',
    );
    expect(agentApprovalUserFacingText('进度已保存，确认前不执行')).toBe(
      '我会等你确认，确认前不会执行',
    );
  });
});
