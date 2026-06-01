import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AgentWorkspacePage } from '../pages/AgentWorkspacePage';

describe('AgentWorkspacePage', () => {
  it('renders a simple assistant surface without technical agent artifacts', () => {
    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('FitMeet Agent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('私人社交生活助理').length).toBeGreaterThan(0);
    expect(
      screen.getByPlaceholderText(
        '告诉我你想找什么人、想做什么事，或者让我看看你最近适合认识谁',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('你可以这样问我')).toBeInTheDocument();
    expect(screen.getByText('帮我找今晚附近能一起散步的人')).toBeInTheDocument();
    expect(screen.queryByText('五个核心任务流')).not.toBeInTheDocument();
    expect(screen.queryByText('同城社交')).not.toBeInTheDocument();
    expect(screen.queryByText(/traceId|agentTrace|planner|tool call|DeepSeek|OpenAI|raw JSON|stack/i)).not.toBeInTheDocument();
  });
});
