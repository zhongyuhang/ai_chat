export interface TextRange { start: number; end: number }
export interface TextPatch extends TextRange { replacement: string; sourceExcerpt?: string }

function patchError(code: string, message: string): never {
  throw Object.assign(new Error(message), { code, statusCode: 409, retryable: false });
}

export function applyPatches(input: {
  source: string;
  sourceRevisionId: string;
  currentRevisionId: string;
  frozenRanges: TextRange[];
  patches: TextPatch[];
}) {
  if (input.sourceRevisionId !== input.currentRevisionId) patchError('SOURCE_REVISION_CHANGED', '补丁基于旧版正文，请重新审校。');
  const ranges = input.frozenRanges.map((range) => ({ ...range })).sort((a, b) => a.start - b.start);
  const patches = input.patches.map((patch) => ({ ...patch })).sort((a, b) => a.start - b.start || a.end - b.end);
  for (const range of [...ranges, ...patches]) {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start || range.end > input.source.length) patchError('PATCH_RANGE_INVALID', '补丁或冻结范围超出正文边界。');
  }
  for (let index = 1; index < patches.length; index += 1) {
    if (patches[index].start < patches[index - 1].end) patchError('PATCH_OVERLAP', '补丁范围相互重叠。');
  }
  for (const patch of patches) {
    if (patch.sourceExcerpt !== undefined && input.source.slice(patch.start, patch.end) !== patch.sourceExcerpt) patchError('PATCH_SOURCE_MISMATCH', '补丁原文与当前范围不一致。');
    if (ranges.some((frozen) => patch.start < frozen.end && patch.end > frozen.start || patch.start === patch.end && patch.start >= frozen.start && patch.start < frozen.end)) patchError('FROZEN_RANGE', '补丁与冻结正文相交。');
  }
  let content = input.source;
  const changes = [];
  for (const patch of [...patches].reverse()) {
    const before = input.source.slice(patch.start, patch.end);
    content = `${content.slice(0, patch.start)}${patch.replacement}${content.slice(patch.end)}`;
    changes.unshift({ start: patch.start, end: patch.end, before, after: patch.replacement });
  }
  return { content, changes, sourceRevisionId: input.sourceRevisionId };
}
