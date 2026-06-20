import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AssistantDataFallback } from '../components/assistant-ui/tool-fallback';

describe('assistant-ui tool fallback rendering', () => {
  it('keeps legacy process payloads as a single non-expandable status by default', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process"
        data={{
          steps: [
            {
              id: 'hydrate-context',
              label: '正在读取你的偏好',
              status: 'complete',
            },
            {
              id: 'slot-memory',
              label: '已记录：今晚、散步、青岛大学附近',
              status: 'complete',
            },
            {
              id: 'candidate-search',
              label: '正在筛选公开可发现的人',
              status: 'running',
            },
          ],
          historySteps: [
            {
              id: 'hydrate-context',
              label: '正在读取你的偏好',
              status: 'complete',
            },
            {
              id: 'slot-memory',
              label: '已记录：今晚、散步、青岛大学附近',
              status: 'complete',
            },
            {
              id: 'candidate-search',
              label: '正在筛选公开可发现的人',
              status: 'running',
            },
          ],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-history-count', '0');
    expect(process).toHaveAttribute('data-process-clickable', 'false');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在筛选公开可发现的人');
    expect(statusLine).not.toHaveTextContent('已记录：今晚、散步、青岛大学附近');
    expect(within(process).queryByText('查看过程')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();

    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
    expect(process).not.toHaveAttribute('open');
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
  });

  it('renders replay summaries as one covering status without opening a process timeline', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process-fallback"
        data={{
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'running',
            title: '正在整理你的约练需求…',
            detail: '我会先按已记录的信息继续，不重复追问。',
          },
          steps: [
            {
              id: 'hydrate_context',
              label: 'hydrate_context planner traceId raw JSON',
              detail: 'tool_call_started payload internal runtime',
              status: 'complete',
            },
            {
              id: 'slot-memory',
              label: '已记录：今晚、散步、青岛大学附近',
              status: 'complete',
            },
            {
              id: 'candidate-search',
              label: '正在筛选公开可发现的人',
              status: 'running',
            },
          ],
          historySteps: [
            {
              id: 'hydrate_context',
              label: 'hydrate_context planner traceId raw JSON',
              detail: 'tool_call_started payload internal runtime',
              status: 'complete',
            },
            {
              id: 'candidate-search',
              label: '正在筛选公开可发现的人',
              status: 'running',
            },
          ],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-fallback');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-history-count', '0');
    expect(process).toHaveAttribute('data-process-clickable', 'false');
    expect(process).toHaveAttribute('data-process-summary-source', 'replay.summary');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在整理你的约练需求');
    expect(statusLine).not.toHaveTextContent('青岛大学附近');
    expect(statusLine).not.toHaveTextContent(/hydrate_context|planner|traceId|raw JSON/i);
    expect(within(process).queryByText('查看过程')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByText(/hydrate_context|planner|traceId|raw JSON|payload|runtime/i)).not.toBeInTheDocument();

    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);

    expect(process).not.toHaveAttribute('open');
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByText(/hydrate_context|planner|traceId|raw JSON|payload|runtime/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
  });

  it('replaces covering status updates without keeping stale process details open', async () => {
    const { rerender } = render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'running' }}
        name="fitmeet-process-fallback"
        data={{
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'running',
            title: '正在整理你的约练需求…',
            detail: '我会按已经说过的信息继续处理。',
            currentSeq: 1,
          },
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-fallback');
    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
    expect(process).not.toHaveAttribute('open');
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();

    rerender(
      <AssistantDataFallback
        type="data"
        status={{ type: 'running' }}
        name="fitmeet-process-fallback"
        data={{
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'running',
            title: '正在筛选公开可发现的人…',
            detail: '我会先看公开资料和公开活动。',
            currentSeq: 2,
          },
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('assistant-ui-tool-fallback')).toHaveAttribute(
        'data-process-open',
        'false',
      ),
    );
    const updatedProcess = screen.getByTestId('assistant-ui-tool-fallback');
    const statusLine = within(updatedProcess).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在筛选公开可发现的人');
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
  });

  it('keeps approval waiting traces collapsed until the user opens the process summary', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process"
        data={{
          visibleSummary: {
            source: 'social_agent_event_v2',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            pendingApproval: true,
            expandable: true,
            state: 'waiting',
            title: '发送邀请前需要你确认',
            detail: '确认前不会发送邀请或交换敏感信息。',
          },
          steps: [
            {
              id: 'social-codex:summary',
              label: '发送邀请前需要你确认',
              detail: '确认前不会发送邀请或交换敏感信息。',
              status: 'waiting',
              processType: 'run_summary',
              metadata: {
                processType: 'run_summary',
                pendingApproval: true,
                dryRunPreviewTitle: '发出散步邀请',
                sideEffectAllowedBeforeApproval: false,
                auditRequired: true,
              },
            },
          ],
          historySteps: [
            {
              id: 'hydrate-context',
              label: 'hydrate_context planner traceId raw JSON',
              detail: 'tool_call_started payload internal runtime',
              status: 'complete',
            },
            {
              id: 'approval',
              label: '发送邀请前需要你确认',
              detail: '对方会看到你的公开约练邀请。',
              status: 'waiting',
              processType: 'approval',
              metadata: {
                processType: 'approval',
                dryRunPreviewTitle: '发出散步邀请',
                sideEffectAllowedBeforeApproval: false,
                auditRequired: true,
              },
            },
          ],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-clickable', 'true');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('发送邀请前需要你确认');
    const statusText = statusLine.textContent ?? '';
    expect((statusText.match(/需要你确认/g) ?? [])).toHaveLength(1);
    expect(statusText).not.toContain('· 等待确认');
    expect(statusLine).not.toHaveTextContent(/hydrate_context|planner|traceId|raw JSON|payload/i);
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-runtime-hints')).not.toBeInTheDocument();

    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);

    expect(process).toHaveAttribute('open');
    expect(screen.getByTestId('assistant-ui-process-detail')).toHaveTextContent(
      '确认前不会发送邀请或交换敏感信息。',
    );
    expect(screen.getByTestId('assistant-ui-process-evidence')).toHaveAttribute(
      'data-evidence-count',
      '1',
    );
    expect(screen.getByTestId('assistant-ui-approval-runtime-hints')).toHaveTextContent(
      '确认前不执行真实动作',
    );
    expect(screen.getByTestId('assistant-ui-approval-runtime-hints')).toHaveTextContent(
      '会留下确认记录',
    );
    expect(screen.queryByText(/hydrate_context|planner|traceId|raw JSON|payload/i)).not.toBeInTheDocument();
  });

  it('adds a short waiting-confirmation suffix only when the status title has not said it', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process"
        data={{
          visibleSummary: {
            source: 'social_agent_event_v2',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            pendingApproval: true,
            expandable: true,
            state: 'waiting',
            title: '正在检查安全边界',
            detail: '确认前不会执行真实动作。',
          },
          pendingConfirmations: [{ id: 'approval-1' }],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在检查安全边界 · 等待确认');
  });

  it('keeps completed checkpoint details product-light instead of showing recovery internals', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process-fallback"
        data={{
          runtime: {
            checkpointId: 88,
            canReplay: true,
            canFork: true,
          },
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'done',
            title: '已整理当前进展',
            detail: '可以继续追问，也可以生成新版本。',
          },
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-fallback');
    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);

    expect(process).toHaveAttribute('open');
    expect(screen.queryByText('已保存可恢复状态')).not.toBeInTheDocument();
    expect(screen.queryByText('状态已保存')).not.toBeInTheDocument();
    expect(screen.getByText('继续处理选项')).toBeInTheDocument();
  });

  it('keeps retryable checkpoint failures collapsed as one status until opened', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process"
        data={{
          runtime: {
            checkpointId: 321,
            checkpointType: 'step',
            canReplay: true,
            canFork: false,
            checkpointAction: 'retry',
            resumeCursor: {
              threadId: 'agent-task:321',
              action: 'retry',
              stepId: 'rank',
            },
          },
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'failed',
            title: '这一步没有完成',
            detail: '可以从保存点重试，不会重复执行已确认的高风险动作。',
          },
          steps: [
            {
              id: 'social-codex:summary',
              label: '这一步没有完成',
              detail: '可以从保存点重试，不会重复执行已确认的高风险动作。',
              status: 'error',
              processType: 'run_summary',
              metadata: {
                processType: 'run_summary',
                source: 'replay.summary',
              },
            },
          ],
          historySteps: [
            {
              id: 'hydrate-context',
              label: 'hydrate_context planner traceId raw JSON',
              detail: 'tool_call_started payload internal runtime',
              status: 'complete',
            },
            {
              id: 'rank',
              label: '排序候选机会',
              detail: '排序服务暂时没有完成。',
              status: 'error',
              processType: 'tool_progress',
            },
          ],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-status', 'error');
    expect(process).toHaveAttribute('data-process-clickable', 'true');
    expect(process).toHaveAttribute('data-checkpoint-state', 'retryable');
    expect(process).toHaveAttribute('data-retryable', 'true');
    expect(process).toHaveAttribute('data-step-id', 'rank');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('这一步没有完成');
    expect(statusLine).not.toHaveTextContent(/hydrate_context|planner|traceId|raw JSON|payload/i);
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();

    expect(screen.queryByText(/hydrate_context|planner|traceId|raw JSON|payload/i)).not.toBeInTheDocument();
  });
});
