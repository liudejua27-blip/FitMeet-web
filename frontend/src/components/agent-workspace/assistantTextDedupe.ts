export function normalizeAssistantTextForMerge(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function collapseRepeatedAssistantTextBlocks(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  if (blocks.length <= 1) return collapseRepeatedWholeText(normalized);
  const deduped: string[] = [];
  for (const block of blocks) {
    const previous = deduped.at(-1);
    if (previous !== undefined && isNearDuplicateAssistantText(previous, block)) {
      deduped[deduped.length - 1] = richerAssistantBlock(previous, block);
      continue;
    }
    deduped.push(block);
  }
  return collapseRepeatedWholeText(deduped.join('\n\n'));
}

export function isSameAssistantAnswerSurface(left: string, right: string): boolean {
  const leftNorm = normalizeAssistantTextForMerge(left);
  const rightNorm = normalizeAssistantTextForMerge(right);
  if (!leftNorm || !rightNorm) return false;
  return (
    leftNorm === rightNorm ||
    leftNorm.includes(rightNorm) ||
    rightNorm.includes(leftNorm) ||
    isNearDuplicateAssistantText(left, right)
  );
}

function richerAssistantBlock(left: string, right: string) {
  const leftNorm = normalizeAssistantTextForMerge(left);
  const rightNorm = normalizeAssistantTextForMerge(right);
  if (rightNorm.length > leftNorm.length) return right;
  return left;
}

function collapseRepeatedWholeText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const approximate = collapseApproximateRepeatedWholeText(trimmed);
  if (approximate !== null) {
    return preserveOuterWhitespace(value, approximate);
  }
  const normalized = normalizeAssistantTextForMerge(trimmed);
  const midpoint = Math.floor(trimmed.length / 2);
  const candidates = [
    trimmed.slice(0, midpoint),
    trimmed.slice(0, midpoint).trim(),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const repeatedCandidates = [
      `${candidate}${candidate}`,
      `${candidate} ${candidate}`,
      `${candidate}\n${candidate}`,
      `${candidate}\n\n${candidate}`,
    ];
    if (
      repeatedCandidates.some(
        (repeated) => normalizeAssistantTextForMerge(repeated) === normalized,
      )
    ) {
      return candidate.trimEnd();
    }
  }
  return value;
}

function collapseApproximateRepeatedWholeText(trimmed: string): string | null {
  if (trimmed.length < 60) return null;
  const splitCandidates = repeatedWholeTextSplitCandidates(trimmed);
  for (const splitIndex of splitCandidates) {
    const left = trimmed.slice(0, splitIndex).trim();
    const right = trimmed.slice(splitIndex).trim();
    if (!left || !right) continue;
    const leftCompact = compactAssistantTextForDedupe(left);
    const rightCompact = compactAssistantTextForDedupe(right);
    if (!leftCompact || !rightCompact) continue;
    const ratio =
      Math.min(leftCompact.length, rightCompact.length) /
      Math.max(leftCompact.length, rightCompact.length);
    if (ratio < 0.78) continue;
    if (isNearDuplicateAssistantText(left, right)) {
      return richerAssistantBlock(left, right).trimEnd();
    }
  }
  return null;
}

function repeatedWholeTextSplitCandidates(value: string): number[] {
  const midpoint = Math.floor(value.length / 2);
  const min = Math.max(1, Math.floor(value.length * 0.4));
  const max = Math.min(value.length - 1, Math.ceil(value.length * 0.6));
  const candidates = new Set<number>([midpoint]);
  for (let index = min; index <= max; index += 1) {
    if (/[\n。！？.!?；;]/.test(value[index - 1] ?? '')) {
      candidates.add(index);
    }
  }
  return [...candidates].sort(
    (left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint),
  );
}

function preserveOuterWhitespace(original: string, collapsed: string): string {
  const leading = original.match(/^\s*/)?.[0] ?? '';
  const trailing = original.match(/\s*$/)?.[0] ?? '';
  return `${leading}${collapsed}${trailing}`;
}

function isNearDuplicateAssistantText(left: string, right: string): boolean {
  const leftNorm = normalizeAssistantTextForMerge(left);
  const rightNorm = normalizeAssistantTextForMerge(right);
  if (!leftNorm || !rightNorm) return false;
  if (leftNorm === rightNorm) return true;
  const leftCompact = compactAssistantTextForDedupe(leftNorm);
  const rightCompact = compactAssistantTextForDedupe(rightNorm);
  if (!leftCompact || !rightCompact) return false;
  if (leftCompact === rightCompact) return true;
  const [shorter, longer] =
    leftCompact.length <= rightCompact.length
      ? [leftCompact, rightCompact]
      : [rightCompact, leftCompact];
  if (shorter.length < 18) return false;
  const coverage = shorter.length / longer.length;
  if (coverage >= 0.72 && longer.includes(shorter)) return true;
  return commonPrefixRatio(leftCompact, rightCompact) >= 0.9;
}

function compactAssistantTextForDedupe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s,，.。!！?？:：;；、"'“”‘’`~·—\-–_()[\]{}【】（）《》<>]/g, '')
    .trim();
}

function commonPrefixRatio(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  if (limit === 0) return 0;
  let count = 0;
  while (count < limit && left[count] === right[count]) count += 1;
  return count / limit;
}
