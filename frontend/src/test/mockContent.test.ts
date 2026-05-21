import { describe, expect, it } from 'vitest';
import { meetToFeedPost, withMockMeets, withMockPosts } from '../data/mockContent';
import type { Meet, Post } from '../types';

const postFixture = {
  id: 42,
  userId: 7,
  type: 'log',
  sport: 'running',
  dist: '',
  username: '真实用户',
  gender: '',
  age: 0,
  city: '青岛',
  loc: '五四广场',
  color: '#168a55',
  colorBg: '#e8f8ef',
  emoji: '',
  title: '真实发布',
  text: '今晚想找人一起轻松跑步。',
  tags: ['跑步'],
  likes: 0,
  comments: 0,
  viewCount: 0,
  slots: '1/2',
  cert: true,
  level: 'all',
  images: [],
  createdAt: '2026-05-21T00:00:00.000Z',
  mock: false,
} as Post;

const meetFixture = {
  id: 88,
  userId: 8,
  username: '真实搭子',
  title: '真实约练',
  type: 'running',
  sport: 'running',
  time: '今晚 20:00',
  loc: '奥帆中心',
  address: '青岛奥帆中心',
  poiId: 'real-meet-88',
  lat: 36.06,
  lng: 120.38,
  dist: '2.1km',
  price: '免费',
  slots: 1,
  maxSlots: 3,
  level: 'all',
  desc: '公开地点轻松跑。',
  feeType: 'free',
  groupType: 'small',
  creatorType: 'peer',
  status: 'active',
  participants: [],
  participantDetails: [],
  cert: true,
  rating: 5,
  meetCount: 1,
  city: '青岛',
  color: '#168a55',
  colorBg: '#e8f8ef',
  createdAt: '2026-05-21T00:00:00.000Z',
  mock: false,
} as Meet;

describe('mockContent fallbacks', () => {
  it('keeps only real posts without padding mock fillers', () => {
    const result = withMockPosts([postFixture]);

    expect(result).toEqual([expect.objectContaining({ id: 42, title: '真实发布', mock: false })]);
  });

  it('keeps only real meets without padding mock fillers', () => {
    const result = withMockMeets([meetFixture]);

    expect(result).toEqual([expect.objectContaining({ id: 88, title: '真实约练', mock: false })]);
  });

  it('filters obvious test records without adding mock replacements', () => {
    const e2ePost = { ...postFixture, id: 77, username: 'E2E甲1754', title: '免费约练测试' };
    const placeholderMeet = { ...meetFixture, id: 99, username: '刘2', title: '跑步搭子' };

    expect(withMockPosts([e2ePost]).some((post) => post.id === 77)).toBe(false);
    expect(withMockMeets([placeholderMeet]).some((meet) => meet.id === 99)).toBe(false);
  });

  it('maps a meet to the unified feed shape', () => {
    const post = meetToFeedPost({ ...meetFixture, id: 12 });

    expect(post).toMatchObject({
      id: -12,
      sourceId: 12,
      type: 'meet',
      title: meetFixture.title,
      loc: meetFixture.loc,
    });
  });
});
