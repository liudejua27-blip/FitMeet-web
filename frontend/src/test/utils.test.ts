import { describe, it, expect } from 'vitest';
import { cn, formatCount, getInitials } from '../lib/utils';

describe('cn (className merge)', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('resolves Tailwind conflicts (last wins)', () => {
    const result = cn('px-2', 'px-4');
    expect(result).toBe('px-4');
  });

  it('handles conditional values', () => {
    const conditional = false as boolean;
    expect(cn('base', conditional && 'hidden', 'extra')).toBe('base extra');
  });
});

describe('formatCount', () => {
  it('returns plain number under 1000', () => {
    expect(formatCount(999)).toBe('999');
  });

  it('formats 1000+ as K', () => {
    expect(formatCount(1000)).toBe('1.0K');
    expect(formatCount(15600)).toBe('15.6K');
  });

  it('formats 1000000+ as M', () => {
    expect(formatCount(1000000)).toBe('1.0M');
    expect(formatCount(2500000)).toBe('2.5M');
  });
});

describe('getInitials', () => {
  it('returns first char', () => {
    expect(getInitials('Alice')).toBe('A');
    expect(getInitials('张三')).toBe('张');
  });

  it('handles empty string', () => {
    expect(getInitials('')).toBe('');
  });
});
