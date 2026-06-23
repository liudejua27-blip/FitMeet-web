/// <reference types="node" />

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = join(process.cwd(), 'src');

describe('Agent user route isolation', () => {
  it('keeps legacy social agent workbench code out of public routes', () => {
    const appSource = readSource('App.tsx');
    const routeSource = readSource(join('routes', 'AppRoutes.tsx'));

    expect(appSource).not.toMatch(/SocialAgentConsolePage|agent-workbench|AgentRunTrace/);
    expect(appSource).not.toMatch(/\.\/debug|src\/debug/);
    expect(routeSource).not.toMatch(/SocialAgentConsolePage|agent-workbench|AgentRunTrace/);
    expect(routeSource).not.toMatch(/\.\/debug|src\/debug/);
    expect(routeSource).not.toContain('path="/social-agent"');
  });

  it('does not register legacy website aliases as product surfaces', () => {
    const routeSource = readSource(join('routes', 'AppRoutes.tsx'));

    expect(routeSource).not.toContain('path="/legacy-home"');
    expect(routeSource).not.toContain('path="/ecosystem"');
    expect(routeSource).not.toContain('path="/developers"');
    expect(routeSource).not.toContain('path="/contact"');
  });

  it('removes internal demo pages from the production route graph', () => {
    const routeSource = readSource(join('routes', 'AppRoutes.tsx'));

    expect(routeSource).not.toMatch(/ENABLE_INTERNAL_DEMO_ROUTES/);
    expect(routeSource).not.toMatch(/DemoAgentSocialLoopPage|DemoInvestorPage/);
    expect(existsSync(join(srcRoot, 'pages', 'DemoAgentSocialLoopPage.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'pages', 'DemoInvestorPage.tsx'))).toBe(false);
    expect(routeSource).not.toContain('path="/internal/demo/*"');
    expect(routeSource).not.toMatch(/path="\/internal\/demo\/agent-social-loop"/);
    expect(routeSource).not.toMatch(/path="\/internal\/demo\/investor"/);
  });

  it('removes the old user-facing and debug workbench files', () => {
    expect(existsSync(join(srcRoot, 'components', 'agent-workbench'))).toBe(false);
    expect(existsSync(join(srcRoot, 'pages', 'SocialAgentConsolePage.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'agent-workbench'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'SocialAgentConsolePage.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'agentTaskEvents.ts'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'agentPageModuleAudit.ts'))).toBe(false);
    expect(existsSync(join(srcRoot, 'components', 'agent', 'ant-guide'))).toBe(false);
    expect(existsSync(join(srcRoot, 'assets', 'agent', 'ant-guide'))).toBe(false);
    expect(existsSync(join(srcRoot, 'components', 'ai-elements'))).toBe(false);
    expect(
      existsSync(join(srcRoot, 'components', 'agent-loop', 'ActivityIcebreakerCard.tsx')),
    ).toBe(false);
    expect(existsSync(join(srcRoot, 'components', 'agent-loop', 'ActivityProofUploader.tsx'))).toBe(
      false,
    );
    expect(existsSync(join(srcRoot, 'components', 'agent-loop', 'AgentApprovalCard.tsx'))).toBe(
      false,
    );

    const debugSourceFiles = collectSourceFiles(join(srcRoot, 'debug')).map((file) =>
      relative(srcRoot, file).replace(/\\/g, '/'),
    );
    expect(debugSourceFiles).toEqual([]);
  });

  it('removes the retired social agent debug API from the production source tree', () => {
    expect(existsSync(join(srcRoot, 'api', 'socialAgentDebugApi.ts'))).toBe(false);

    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => !relative(srcRoot, file).replace(/\\/g, '/').startsWith('test/'))
      .filter((file) => readFileSync(file, 'utf8').includes('socialAgentDebugApi'))
      .map((file) => relative(srcRoot, file).replace(/\\/g, '/'))
      .filter((path) => !path.startsWith('debug/'));

    expect(offenders).toEqual([]);
  });

  it('keeps the agent workspace on the user-facing API contract', () => {
    const userPathSources = [
      join(srcRoot, 'pages', 'AgentWorkspacePage.tsx'),
      ...collectSourceFiles(join(srcRoot, 'components', 'agent-workspace')),
      ...collectSourceFiles(join(srcRoot, 'components', 'assistant-ui')),
    ];

    const userPathText = userPathSources.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(userPathText).not.toMatch(
      /socialAgentDebugApi|AgentRunTrace|SocialAgentConsolePage|agent-workbench/,
    );
    expect(userPathText).not.toMatch(
      /socialAgentApi\.(performAction|handleMessage|routeMessage)\s*\(/,
    );
    expect(userPathText).not.toMatch(
      /fitMeetCoreEndpoints\.socialAgentChat\.(taskActions|messages|routeMessage)\b/,
    );
  });

  it('keeps legacy non-stream Agent endpoints confined to the API compatibility layer', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => {
        const relativePath = relative(srcRoot, file).replace(/\\/g, '/');
        return !relativePath.startsWith('test/') && relativePath !== 'api/socialAgentApi.ts';
      })
      .flatMap((file) => {
        const relativePath = relative(srcRoot, file).replace(/\\/g, '/');
        const source = readFileSync(file, 'utf8');
        const patterns = [
          /socialAgentApi\.(performAction|handleMessage|routeMessage)\s*\(/,
          /fitMeetCoreEndpoints\.socialAgentChat\.(taskActions|messages|routeMessage)\b/,
        ];
        return patterns
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${relativePath}: ${pattern}`);
      });

    expect(offenders).toEqual([]);
  });

  it('keeps production Agent streams on the SocialAgentEventV2 user-facing endpoints', () => {
    const productionAgentSources = [
      join(srcRoot, 'api', 'socialAgentApi.ts'),
      join(srcRoot, 'pages', 'AgentWorkspacePage.tsx'),
      ...collectSourceFiles(join(srcRoot, 'components', 'agent-workspace')),
      ...collectSourceFiles(join(srcRoot, 'components', 'assistant-ui')),
    ];

    const productionAgentText = productionAgentSources
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const socialAgentApiSource = readSource(join('api', 'socialAgentApi.ts'));
    const realAdapterSource = readSource(
      join('components', 'agent-workspace', 'api', 'realAgentAdapter.ts'),
    );

    expect(socialAgentApiSource).toContain('fitMeetCoreEndpoints.socialAgentChat.streamUser');
    expect(socialAgentApiSource).toContain('fitMeetCoreEndpoints.socialAgentChat.messagesStream');
    expect(socialAgentApiSource).toContain(
      'fitMeetCoreEndpoints.socialAgentChat.routeMessageStream',
    );
    expect(socialAgentApiSource).toContain(
      'fitMeetCoreEndpoints.socialAgentChat.taskMessagesStream',
    );
    expect(socialAgentApiSource).not.toContain('fitMeetCoreEndpoints.socialAgentChat.stream,');

    expect(productionAgentText).toContain('runUserFacingStream');
    expect(productionAgentText).toContain('runUserFacingAgentStreamAt');
    expect(realAdapterSource).toContain('apiClient.performActionStream(');
    expect(realAdapterSource).not.toContain('apiClient.performAction(');
    expect(realAdapterSource).not.toContain("'performAction'");
    expect(realAdapterSource).not.toContain('performActionStream?:');
    expect(productionAgentText).not.toMatch(
      /socialAgentDebugApi|runSocialAgentStream|fitMeetCoreEndpoints\.socialAgentChat\.stream\b/,
    );
  });

  it('keeps message submission inside the active thread instead of creating a thread per message', () => {
    const submitRuntimeSource = readSource(
      join('components', 'agent-workspace', 'useAgentSubmitRuntime.ts'),
    );
    const threadRuntimeSource = readSource(
      join('components', 'agent-workspace', 'useAgentThreadRuntime.ts'),
    );
    const workspaceSource = readSource(join('components', 'agent-workspace', 'AgentWorkspace.tsx'));
    const controllerSource = readSource(
      join('components', 'agent-workspace', 'useAgentWorkspaceController.ts'),
    );
    const assistantPropsSource = readSource(
      join('components', 'agent-workspace', 'buildAgentAssistantProps.ts'),
    );

    expect(submitRuntimeSource).toContain('const threadIdForRun =');
    expect(submitRuntimeSource).toContain(
      "conversationIntent === 'conversation' ? null : canonicalActiveThreadId",
    );
    expect(submitRuntimeSource).toContain('threadId: threadIdForRun');
    expect(submitRuntimeSource).toContain('beginAbortableRun(controller, threadIdForRun)');
    expect(submitRuntimeSource).toContain('threadIdFromResponse(finalResult.response)');
    expect(submitRuntimeSource).toContain('observedRunThreadIdRef.current');
    expect(submitRuntimeSource).toContain('socialCodexThreadIdForTask(finalResult.taskId)');
    expect(submitRuntimeSource).not.toMatch(/createThread\s*\(/);
    expect(submitRuntimeSource).not.toMatch(/socialAgentApi\.createThread/);

    expect(threadRuntimeSource).toContain('getThread(threadId)');
    expect(threadRuntimeSource).toContain('updateThread(canonicalActiveThreadId');
    expect(threadRuntimeSource).toContain('const startNewThread = async () =>');
    expect(threadRuntimeSource).toContain('newThreadCreatingRef.current');
    expect(threadRuntimeSource).toContain('if (newThreadCreatingRef.current) return');
    expect(threadRuntimeSource).toContain('socialAgentApi.createThread()');
    expect(workspaceSource).not.toMatch(/createThread\s*\(/);
    expect(workspaceSource).toContain('useAgentWorkspaceController');
    expect(controllerSource).toContain('startNewThread');
    expect(assistantPropsSource).toContain('onNewConversation');
    expect(assistantPropsSource).toContain('void startNewThread()');
  });

  it('keeps single-run message and card dedupe runtime wired into the production Agent path', () => {
    const reducerPath = join(
      srcRoot,
      'components',
      'agent-workspace',
      'agentAssistantMessageReducer.ts',
    );
    const cardIdentityPath = join(srcRoot, 'components', 'agent-workspace', 'agentCardIdentity.ts');
    const textDedupePath = join(srcRoot, 'components', 'agent-workspace', 'assistantTextDedupe.ts');
    const messageStreamSource = readSource(
      join('components', 'agent-workspace', 'useAgentMessageStream.ts'),
    );
    const finalResultSource = readSource(
      join('components', 'agent-workspace', 'useAgentFinalResultRuntime.ts'),
    );
    const approvalDispatchSource = readSource(
      join('components', 'agent-workspace', 'useAgentApprovalDispatchMessages.ts'),
    );
    const reminderRuntimeSource = readSource(
      join('components', 'agent-workspace', 'useAgentReminderRuntime.ts'),
    );

    expect(existsSync(reducerPath)).toBe(true);
    expect(existsSync(cardIdentityPath)).toBe(true);
    expect(existsSync(textDedupePath)).toBe(true);
    expect(messageStreamSource).toContain("from './agentAssistantMessageReducer'");
    expect(messageStreamSource).toContain("from './assistantTextDedupe'");
    expect(messageStreamSource).toContain('reduceSingleRunAssistantMessages');
    expect(messageStreamSource).toContain('findSingleRunAssistantMessageIndex');
    expect(finalResultSource).toContain("from './agentAssistantMessageReducer'");
    expect(finalResultSource).toContain("from './agentCardIdentity'");
    expect(finalResultSource).toContain("from './assistantTextDedupe'");
    expect(finalResultSource).toContain('reduceSingleRunAssistantMessages');
    expect(finalResultSource).toContain('mergeUniqueAgentCards');
    expect(approvalDispatchSource).toContain("from './agentCardIdentity'");
    expect(approvalDispatchSource).toContain('mergeUniqueAgentCards');
    expect(reminderRuntimeSource).toContain("from './agentCardIdentity'");
    expect(reminderRuntimeSource).toContain('agentCardDedupKeys');
  });

  it('keeps retired agent copy and shell selectors out of production source', () => {
    const forbiddenPatterns = [
      /今天想认识什么样的人？/,
      /开始低压力社交/,
      /开始一个低压力任务/,
      /找个跑步搭子/,
      /正在调用工具/,
      /工具已完成/,
      /工具整理结果/,
      /关联步骤/,
      /return ['"]工具['"]/,
      /agent-gpt-copy-shell/,
      /agent-workspace--gpt/,
      /agent-gpt-result-block/,
      /\bagent-gpt-/,
      /agent-workspace__/,
      /agent-workspace--/,
      /agent-center-input/,
      /agent-quick-actions/,
      /agent-context-pills/,
      /agent-progressive-results/,
      /\bagent-flow-/,
      /\bagent-permission-select\b/,
      /agent-workspace-ant-guide/,
    ];
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => !relative(srcRoot, file).replace(/\\/g, '/').startsWith('test/'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return forbiddenPatterns
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${relative(srcRoot, file).replace(/\\/g, '/')}: ${pattern}`);
      });

    expect(offenders).toEqual([]);
  });

  it('keeps backend recovery and approval jargon behind production sanitizers', () => {
    const allowedSanitizerFiles = new Set([
      'api/socialAgentApi.ts',
      'components/agent-workspace/agentWorkspaceRuntime.ts',
      'components/assistant-ui/public-process-text.ts',
      'components/assistant-ui/tool-approval-card.tsx',
      'components/assistant-ui/tool-card-actions.tsx',
      'components/assistant-ui/tool-ui-schema.ts',
      'lib/agentApprovalCopy.ts',
      'lib/socialCodexProcessCopy.ts',
    ]);
    const forbiddenUserCopyPatterns = [
      /这次处理没有完成/,
      /操作没有完成/,
      /可恢复中断/,
      /风险级别/,
      /状态已保存/,
      /等待保存点/,
      /将要执行/,
      /动作[：:]/,
      /确认前不执行/,
      /不会自动发送、连接或发布/,
      /同意后从保存点继续/,
    ];
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => {
        const relativePath = relative(srcRoot, file).replace(/\\/g, '/');
        return (
          !relativePath.startsWith('test/') &&
          !relativePath.startsWith('dev/') &&
          !allowedSanitizerFiles.has(relativePath)
        );
      })
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return forbiddenUserCopyPatterns
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${relative(srcRoot, file).replace(/\\/g, '/')}: ${pattern}`);
      });

    expect(offenders).toEqual([]);
  });

  it('keeps mock-named Agent data out of production components', () => {
    expect(existsSync(join(srcRoot, 'data', 'agentMockData.ts'))).toBe(false);

    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => !relative(srcRoot, file).replace(/\\/g, '/').startsWith('test/'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return source.includes('agentMockData')
          ? [relative(srcRoot, file).replace(/\\/g, '/')]
          : [];
      });

    expect(offenders).toEqual([]);
  });

  it('removes the runtime mock Agent adapter completely', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => !relative(srcRoot, file).replace(/\\/g, '/').startsWith('test/'))
      .flatMap((file) => {
        const relativePath = relative(srcRoot, file).replace(/\\/g, '/');
        const source = readFileSync(file, 'utf8');
        const mentionsMockAdapter =
          source.includes('mockAgentAdapter') || source.includes('createMockAgentAdapter');
        const mentionsMockRuntimeIds =
          source.includes('mock-candidate') ||
          source.includes('mock-opportunity') ||
          source.includes('mock-thread-checkpoint');
        if (!mentionsMockAdapter && !mentionsMockRuntimeIds) return [];
        return [relativePath];
      });

    const createAgentAdapterSource = readSource(
      join('components', 'agent-workspace', 'api', 'createAgentAdapter.ts'),
    );
    expect(
      existsSync(join(srcRoot, 'components', 'agent-workspace', 'api', 'mockAgentAdapter.ts')),
    ).toBe(false);
    expect(existsSync(join(srcRoot, 'dev', 'agent', 'mockAgentAdapter.ts'))).toBe(false);
    expect(createAgentAdapterSource).not.toContain('loadDevelopmentMockAgentAdapter');
    expect(createAgentAdapterSource).not.toContain("import('../../../dev/agent/mockAgentAdapter')");
    expect(createAgentAdapterSource).not.toContain('VITE_AGENT_MOCK_FLOW');
    expect(createAgentAdapterSource).not.toContain("from './mockAgentAdapter'");
    expect(offenders).toEqual([]);
  });

  it('does not introduce AI SDK chat architecture dependencies into the app shell', () => {
    const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const allSourceText = collectSourceFiles(srcRoot)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(packageJson).not.toContain('@ai-sdk/react');
    expect(allSourceText).not.toMatch(/useChat\s*\(/);
  });

  it('keeps heavy assistant Tool UI out of the initial message renderer chunk', () => {
    const messageSource = readSource(join('components', 'assistant-ui', 'message.tsx'));
    const assistantShellSource = readSource(
      join('components', 'agent-workspace', 'FitMeetAssistantUI.tsx'),
    );

    expect(messageSource).toContain("import('./tool-fallback')");
    expect(messageSource).toContain('lazy(() =>');
    expect(messageSource).not.toMatch(
      /import\s+\{[^}]*AssistantToolFallback[^}]*\}\s+from\s+['"]\.\/tool-fallback['"]/,
    );
    expect(messageSource).not.toMatch(/from\s+['"]\.\/tool-fallback['"]/);
    expect(assistantShellSource).not.toContain('./tool-fallback');
  });

  it('keeps AgentWorkspace as a thin assistant-ui shell backed by controller hooks', () => {
    const workspaceSource = readSource(join('components', 'agent-workspace', 'AgentWorkspace.tsx'));
    const controllerPath = join(
      srcRoot,
      'components',
      'agent-workspace',
      'useAgentWorkspaceController.ts',
    );
    const controllerSource = readFileSync(controllerPath, 'utf8');

    expect(existsSync(controllerPath)).toBe(true);
    expect(workspaceSource).toContain('useAgentWorkspaceController');
    expect(workspaceSource).toContain('FitMeetAssistantUI');
    expect(workspaceSource).not.toMatch(
      /useAgentSessionRestore|useAgentStreamingRun|useAgentApprovalRuntime|useAgentThreadBranches/,
    );
    expect(workspaceSource).not.toMatch(
      /SocialAgentConsolePage|agent-workbench|CodexAntPet|AntGuide/,
    );

    expect(controllerSource).toContain('useAgentSessionRestore');
    expect(controllerSource).toContain('useAgentStreamingRun');
    expect(controllerSource).toContain('useAgentApprovalRuntime');
    expect(controllerSource).toContain('useAgentThreadBranches');
    expect(controllerSource).not.toMatch(
      /SocialAgentConsolePage|agent-workbench|CodexAntPet|AntGuide/,
    );
  });
});

function readSource(path: string) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) return collectSourceFiles(fullPath);
    if (!/\.(ts|tsx|css)$/.test(entry)) return [];
    return [fullPath];
  });
}
