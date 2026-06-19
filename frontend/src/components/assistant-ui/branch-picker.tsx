import { BranchPickerPrimitive, useAuiState } from '@assistant-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MouseEvent } from 'react';

import type { FitMeetAssistantMessage } from '../agent-workspace/FitMeetAssistantUI';
import { TooltipIconButton } from './tooltip-icon-button';

type ChatGPTBranchPickerProps = {
  branch: NonNullable<FitMeetAssistantMessage['branch']>;
  messageId: string;
  onBranchSwitch: (messageId: string, direction: 'previous' | 'next') => void;
};

export function ChatGPTBranchPicker({
  branch,
  messageId,
  onBranchSwitch,
}: ChatGPTBranchPickerProps) {
  const runtimeBranchNumber = useAuiState((state) => state.message.branchNumber);
  const runtimeBranchCount = useAuiState((state) => state.message.branchCount);
  const branchCount = runtimeBranchCount > 1 ? runtimeBranchCount : branch.count;
  if (branchCount <= 1) return null;
  const syncStatus = branch.syncStatus ?? 'idle';
  const currentIndex = Math.min(
    branchCount,
    Math.max(
      1,
      runtimeBranchCount > 1 ? runtimeBranchNumber : branch.activeIndex ?? branch.index ?? 1,
    ),
  );
  const atFirst = currentIndex <= 1;
  const atLast = currentIndex >= branchCount;
  const branchSource = runtimeBranchCount > 1 ? 'runtime' : 'fitmeet';

  const switchBranch = (direction: 'previous' | 'next') => {
    if (direction === 'previous' && atFirst) return;
    if (direction === 'next' && atLast) return;
    onBranchSwitch(messageId, direction);
  };

  const handleBranchButtonClick =
    (direction: 'previous' | 'next') => (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      switchBranch(direction);
    };

  return (
    <BranchPickerPrimitive.Root
      className="ml-1 flex items-center gap-1 text-xs text-[#5d5d5d]"
      data-testid="assistant-ui-branch-picker"
      role="toolbar"
      data-branch-picker-model="assistant-ui-branch-picker"
      data-persistence="fitmeet-thread-metadata"
      data-branch-source={branchSource}
      data-sync-status={syncStatus}
      data-current-index={currentIndex}
      data-branch-count={branchCount}
      data-can-previous={atFirst ? 'false' : 'true'}
      data-can-next={atLast ? 'false' : 'true'}
      data-action-count="2"
      data-branch-position={
        atFirst ? 'first' : atLast ? 'last' : 'middle'
      }
      aria-label={`回答版本 ${currentIndex} / ${branchCount}`}
      hideWhenSingleBranch
    >
      <span className="sr-only">回答版本</span>
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton
          tooltip={atFirst ? '已经是第一个回答' : '上一个回答'}
          aria-label="上一个回答"
          className="size-7 rounded-md text-[#5d5d5d]"
          data-action-id="branch-previous"
          data-branch-action="previous"
          data-enabled={atFirst ? 'false' : 'true'}
          data-boundary={atFirst ? 'first' : undefined}
          onClick={handleBranchButtonClick('previous')}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span
        className="min-w-8 text-center text-xs tabular-nums text-[#5d5d5d]"
        aria-live="polite"
        aria-atomic="true"
        data-testid="assistant-ui-branch-status"
        data-source={branchSource}
        data-current-index={currentIndex}
        data-branch-count={branchCount}
      >
        {runtimeBranchCount > 1 ? (
          <>
            <BranchPickerPrimitive.Number />/<BranchPickerPrimitive.Count />
          </>
        ) : (
          <>
            {currentIndex}/{branchCount}
          </>
        )}
      </span>
      <BranchSyncStatus status={syncStatus} />
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton
          tooltip={atLast ? '已经是最新回答' : '下一个回答'}
          aria-label="下一个回答"
          className="size-7 rounded-md text-[#5d5d5d]"
          data-action-id="branch-next"
          data-branch-action="next"
          data-enabled={atLast ? 'false' : 'true'}
          data-boundary={atLast ? 'last' : undefined}
          onClick={handleBranchButtonClick('next')}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function BranchSyncStatus({
  status,
}: {
  status: NonNullable<FitMeetAssistantMessage['branch']>['syncStatus'];
}) {
  if (!status || status === 'idle') return null;
  const label =
    status === 'syncing'
      ? '同步中'
      : status === 'synced'
        ? '版本已同步'
        : '同步失败';
  if (status === 'synced') {
    return (
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        data-testid="assistant-ui-branch-sync"
        data-sync-status={status}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={
        status === 'failed'
          ? 'rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] leading-4 text-red-700 ring-1 ring-red-100'
          : 'rounded-full bg-black/[0.03] px-1.5 py-0.5 text-[10px] leading-4 text-[#71717a] ring-1 ring-black/[0.05]'
      }
      role="status"
      aria-live="polite"
      data-testid="assistant-ui-branch-sync"
      data-sync-status={status}
    >
      {label}
    </span>
  );
}
