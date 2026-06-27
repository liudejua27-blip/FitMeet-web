import * as fs from 'fs';
import * as path from 'path';

import { SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS } from './social-agent-context-window';

function listProductionTypeScriptFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...listProductionTypeScriptFiles(absolute));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.spec.ts')) continue;
    if (entry.name.endsWith('.acceptance.ts')) continue;
    if (entry.name.endsWith('.acceptance.spec.ts')) continue;
    result.push(absolute);
  }
  return result;
}

function findExplicitSmallContextWindows(source: string) {
  const checks = [
    /buildSocialAgentLlmConversationHistory\([^)\n]*,\s*(\d+)\s*\)/g,
    /readSocialAgentConversationHistory\([^)\n]*,\s*(\d+)\s*\)/g,
    /selectSocialAgentContextWindow\([^)\n]*,\s*(\d+)\s*\)/g,
  ];
  const matches: number[] = [];
  for (const pattern of checks) {
    for (const match of source.matchAll(pattern)) {
      const limit = Number(match[1]);
      if (
        Number.isFinite(limit) &&
        limit < SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS
      ) {
        matches.push(limit);
      }
    }
  }
  return matches;
}

function findHardcodedTinyLlmContextSlices(file: string, source: string) {
  const fileName = path.basename(file);
  const llmFacingFile =
    /social-agent-(?:intent-router|planner|route-decision|route-context|route-profile-turn|chat-llm|final-response|memory-context|context-hydrator|tool-executor|current-task-summary)\./.test(
      fileName,
    ) || fileName === 'fitmeet-subagent-worker-command.contract.ts';
  if (!llmFacingFile) return [];

  const matches: string[] = [];
  const checks = [
    /\.slice\(\s*-\s*(8|10|12|20|30)\s*\)/g,
    /\.slice\(\s*-\s*(?:contextLimit|limit)\s*\)/g,
  ];
  for (const pattern of checks) {
    for (const match of source.matchAll(pattern)) {
      const raw = match[0];
      if (raw.includes('contextLimit') || raw.includes('limit')) {
        if (
          !source.includes('socialAgentContextTurnLimit') &&
          !source.includes('socialAgentLlmContextTurnLimit')
        ) {
          matches.push(raw);
        }
        continue;
      }
      matches.push(raw);
    }
  }
  return matches;
}

describe('Social Agent context window production boundary', () => {
  it('does not let LLM-facing conversation prompts regress to tiny history windows', () => {
    const violations: Array<{ file: string; limits: number[] }> = [];

    for (const file of listProductionTypeScriptFiles(__dirname)) {
      const source = fs.readFileSync(file, 'utf8');
      const limits = findExplicitSmallContextWindows(source);
      if (limits.length > 0) {
        violations.push({
          file: path.basename(file),
          limits,
        });
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not hide tiny history slices inside LLM-facing route, planner, or memory payloads', () => {
    const violations: Array<{ file: string; matches: string[] }> = [];

    for (const file of listProductionTypeScriptFiles(__dirname)) {
      const source = fs.readFileSync(file, 'utf8');
      const matches = findHardcodedTinyLlmContextSlices(file, source);
      if (matches.length > 0) {
        violations.push({
          file: path.basename(file),
          matches,
        });
      }
    }

    expect(violations).toEqual([]);
  });
});
