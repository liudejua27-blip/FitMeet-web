import {
  sanitizeSocialCodexProcessDetail,
  sanitizeSocialCodexProcessTitle,
} from './social-codex-public-process-text';

describe('Social Codex public process text', () => {
  it('strips internal trace key-value fragments while preserving useful user-facing copy', () => {
    expect(
      sanitizeSocialCodexProcessTitle(
        '已记录：今天晚上、青岛大学附近、散步 traceId=trace-hidden runId=run-hidden payload={"stage":"slot_filling"}',
        { stage: 'slot_filling', state: 'done' },
      ),
    ).toBe('已记录：今天晚上、青岛大学附近、散步');

    expect(
      sanitizeSocialCodexProcessDetail(
        '我会继续用这些信息筛选公开可发现的人 metadata=private runtime=worker checkpointId=123 resumeToken=secret',
        { stage: 'search_candidates', state: 'running' },
      ),
    ).toBe('我会继续用这些信息筛选公开可发现的人');
  });

  it('still falls back for pure internal trace/debug process text', () => {
    expect(
      sanitizeSocialCodexProcessTitle('tool_call_started planner traceId=hidden', {
        stage: 'search_candidates',
        state: 'running',
      }),
    ).toBe('正在筛选公开可发现的人');

    expect(
      sanitizeSocialCodexProcessDetail('raw JSON stack internal runtime', {
        stage: 'search_candidates',
        state: 'running',
      }),
    ).toBe('只使用公开可发现的信息，联系对方前仍需要你确认。');
  });
});
