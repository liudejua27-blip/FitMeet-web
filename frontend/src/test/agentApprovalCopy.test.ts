import { describe, expect, it } from 'vitest';

import {
  agentApprovalActionLabel,
  agentApprovalEffectText,
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
  });
});
