import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AntGuide,
  ANT_GUIDE_STATE_ASSETS,
  ANT_GUIDE_STATES,
  ANT_GUIDE_COPY,
} from '../components/agent/ant-guide';

describe('AntGuide', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders default idle copy and accessible status label', () => {
    render(<AntGuide state="idle" interactive={false} />);

    expect(screen.getByRole('img', { name: '智能小蚁正在等待你的输入' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(ANT_GUIDE_COPY.idle.title ?? '')).toBeInTheDocument();
    expect(screen.getByText(ANT_GUIDE_COPY.idle.description ?? '')).toBeInTheDocument();
  });

  it('exposes state, target, size, and reduced motion attributes for page integration', () => {
    render(
      <AntGuide
        state="discovering"
        target="recommendation"
        size="lg"
        interactive={false}
        reducedMotion
      />,
    );

    const guide = screen
      .getByRole('img', { name: '智能小蚁正在发现附近场景' })
      .closest('.ant-guide');
    expect(guide).not.toBeNull();
    expect(guide).toHaveAttribute('data-state', 'discovering');
    expect(guide).toHaveAttribute('data-target', 'recommendation');
    expect(guide).toHaveAttribute('data-size', 'lg');
    expect(guide).toHaveClass('ant-guide--lg');
    expect(guide).toHaveClass('ant-guide--reduced-motion');
  });

  it('allows pages to override title and description copy', () => {
    render(
      <AntGuide
        state="success"
        interactive={false}
        copy={{
          title: '自定义完成标题',
          description: '自定义完成说明',
        }}
      />,
    );

    expect(screen.getByRole('img', { name: '智能小蚁已完成操作' })).toBeInTheDocument();
    expect(screen.getByText('自定义完成标题')).toBeInTheDocument();
    expect(screen.getByText('自定义完成说明')).toBeInTheDocument();
  });

  it('uses image assets for all visual states', () => {
    for (const state of ANT_GUIDE_STATES) {
      expect(ANT_GUIDE_STATE_ASSETS[state].webp).toContain(`ant-guide-${state}`);
      expect(ANT_GUIDE_STATE_ASSETS[state].png).toContain(`ant-guide-${state}`);
      expect(ANT_GUIDE_STATE_ASSETS[state].width).toBeGreaterThan(0);
      expect(ANT_GUIDE_STATE_ASSETS[state].height).toBeGreaterThan(0);
    }
  });

  it('renders WebP by default and falls back to PNG before SVG', async () => {
    const { container } = render(
      <AntGuide state="idle" interactive={false} />,
    );

    const webpImage = container.querySelector<HTMLImageElement>('.ant-guide__asset');
    expect(webpImage).not.toBeNull();
    expect(webpImage?.getAttribute('src')).toContain('.webp');

    if (webpImage) {
      fireEvent.error(webpImage);
    }

    await waitFor(() => {
      const pngImage = container.querySelector<HTMLImageElement>('.ant-guide__asset');
      expect(pngImage?.getAttribute('src')).toContain('.png');
    });

    const pngImage = container.querySelector<HTMLImageElement>('.ant-guide__asset');
    if (pngImage) {
      fireEvent.error(pngImage);
    }

    await waitFor(() => {
      expect(container.querySelector('.ant-guide-svg')).toBeInTheDocument();
    });
  });
});
