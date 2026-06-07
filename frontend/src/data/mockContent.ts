import type { Meet, Post } from '../types';

export function filterDisplayablePosts(posts: Post[], minimum = 4) {
  void minimum;
  return posts.filter(isDisplayablePost);
}

export function filterDisplayableMeets(meets: Meet[], minimum = 4) {
  void minimum;
  return meets.filter(isDisplayableMeet);
}

export const withMockPosts = filterDisplayablePosts;
export const withMockMeets = filterDisplayableMeets;

export function uniquePostsByUser(posts: Post[], limit = 5) {
  const seen = new Set<string>();
  const result: Post[] = [];
  for (const post of posts.filter(isDisplayablePost)) {
    const key = post.userId ? `user:${post.userId}` : `name:${post.username}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(post);
    if (result.length >= limit) break;
  }
  return result;
}

function isDisplayablePost(post: Post) {
  return !isTestLikeText([post.username, post.title, post.text].filter(Boolean).join(' '));
}

function isDisplayableMeet(meet: Meet) {
  return !isTestLikeText([meet.username, meet.title, meet.desc].filter(Boolean).join(' '));
}

function isTestLikeText(value: string) {
  return /E2E|测试|test|mock|真实\s*API|免费约练测试|一周三炮|(?:^|\s)[\u4e00-\u9fa5]{1,2}\d{1,6}(?:\s|$)|[甲乙丙丁]\d{3,}/iu.test(
    value,
  );
}

export function meetToFeedPost(meet: Meet): Post {
  return {
    id: meet.id > 0 ? -meet.id : meet.id,
    sourceId: meet.id,
    userId: meet.userId,
    type: 'meet',
    sport: meet.type,
    dist: meet.dist || '',
    distanceMeters: meet.distanceMeters,
    username: meet.username,
    gender: '',
    age: 0,
    city: meet.city || '',
    loc: meet.loc,
    address: meet.address || '',
    poiId: meet.poiId,
    lat: meet.lat,
    lng: meet.lng,
    color: meet.color,
    colorBg: meet.colorBg,
    emoji: '',
    title: meet.title,
    text: meet.desc || `${meet.time} · ${meet.loc}`,
    tags: [meet.groupType, meet.creatorType].filter(Boolean) as string[],
    likes: 0,
    comments: 0,
    viewCount: 0,
    slots: `${Math.max(meet.maxSlots - meet.slots, 0)}/${meet.maxSlots}`,
    cert: meet.cert,
    level: meet.level,
    images: [],
    createdAt: meet.createdAt,
    mock: meet.mock,
  };
}
