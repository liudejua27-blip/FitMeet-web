import { describe, expect, it } from 'vitest';
import { meetToFeedPost, mockMeets, mockPosts, withMockMeets, withMockPosts } from '../data/mockContent';

describe('mockContent fallbacks', () => {
  it('pads posts to at least four items without replacing real data', () => {
    const real = { ...mockPosts[0], id: 42, mock: false, title: '真实发布' };

    const result = withMockPosts([real]);

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ id: 42, title: '真实发布', mock: false });
    expect(result.slice(1).every((post) => post.mock)).toBe(true);
  });

  it('pads meets to at least four items without replacing real data', () => {
    const real = { ...mockMeets[0], id: 88, mock: false, title: '真实约练' };

    const result = withMockMeets([real]);

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ id: 88, title: '真实约练', mock: false });
    expect(result.slice(1).every((meet) => meet.mock)).toBe(true);
  });

  it('filters obvious test records before padding content', () => {
    const e2ePost = { ...mockPosts[0], id: 77, mock: false, username: 'E2E甲1754', title: '免费约练测试' };
    const placeholderMeet = { ...mockMeets[0], id: 99, mock: false, username: '刘2', title: '跑步搭子' };

    expect(withMockPosts([e2ePost]).some((post) => post.id === 77)).toBe(false);
    expect(withMockMeets([placeholderMeet]).some((meet) => meet.id === 99)).toBe(false);
  });

  it('maps a meet to the unified feed shape', () => {
    const post = meetToFeedPost({ ...mockMeets[0], id: 12 });

    expect(post).toMatchObject({
      id: -12,
      sourceId: 12,
      type: 'meet',
      title: mockMeets[0].title,
      loc: mockMeets[0].loc,
    });
  });
});
