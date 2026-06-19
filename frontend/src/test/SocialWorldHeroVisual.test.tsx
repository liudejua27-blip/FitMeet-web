import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialWorldHeroVisual } from '../components/website/SocialWorldHeroVisual';

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('SocialWorldHeroVisual', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: !query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves from idle into a highlighted card state on pointer proximity', () => {
    render(<SocialWorldHeroVisual />);

    const root = screen
      .getByLabelText('Social World App 互动主视觉')
      .closest('.fm-social-hero-visual') as HTMLElement;
    const hotspot = root.querySelector<HTMLElement>('.fm-promo-hotspot--coffee');
    const ant = root.querySelector<HTMLElement>('.fm-ant-agent-cutout');

    expect(screen.queryByAltText('Social World App 宣传封面')).toBeNull();
    expect(screen.getByAltText('黑金色机械风 FitMeet 小蚁智能体')).toBeTruthy();
    expect(hotspot).toBeTruthy();
    expect(ant).toBeTruthy();

    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(rect(600, 120, 720, 520));
    vi.spyOn(hotspot!, 'getBoundingClientRect').mockReturnValue(rect(1030, 365, 170, 118));
    vi.spyOn(ant!, 'getBoundingClientRect').mockReturnValue(rect(1070, 520, 168, 258));

    const event = new Event('pointermove', { bubbles: true }) as PointerEvent;
    Object.defineProperties(event, {
      clientX: { value: 1115 },
      clientY: { value: 424 },
    });

    act(() => {
      root.dispatchEvent(event);
    });

    expect(root.dataset.activeCard).toBe('coffee');
    expect(root.dataset.cardNear).toBe('true');
    expect(root.style.getPropertyValue('--antenna-scale')).toBe('1.22');
    expect(root.style.getPropertyValue('--look-x')).not.toBe('-5px');
    expect(root.style.getPropertyValue('--ant-rotate')).not.toBe('0deg');
  });
});
