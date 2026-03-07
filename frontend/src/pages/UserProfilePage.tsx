import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FEED_DATA, COACH_DATA, MEET_DATA } from '../data/mockData';
import { useSocialStore } from '../stores';
import * as dataService from '../services/dataService';

/** Generate a mock user profile from ID */
function getUserFromId(id: number) {
  // Try to find in feed data
  const post = FEED_DATA.find((p) => p.id === id);
  if (post) {
    return {
      id,
      name: post.username,
      avatar: post.username[0],
      color: post.color,
      gender: post.gender,
      age: post.age,
      city: post.city,
      bio: `热爱${post.sport === 'gym' ? '健身' : post.sport === 'run' ? '跑步' : '运动'}，一起来约练！`,
      followers: Math.floor(Math.random() * 2000) + 100,
      following: Math.floor(Math.random() * 500) + 50,
      posts: Math.floor(Math.random() * 100) + 10,
      cert: post.cert,
    };
  }
  // Try to find in coach data
  const coach = COACH_DATA.find((c) => c.id === id);
  if (coach) {
    return {
      id,
      name: coach.name,
      avatar: coach.name[0],
      color: coach.color,
      gender: '♂',
      age: 28,
      city: '北京',
      bio: coach.desc,
      followers: coach.followers,
      following: 200,
      posts: 50,
      cert: coach.cert,
    };
  }
  return {
    id,
    name: `用户${id}`,
    avatar: 'U',
    color: '#C8FF00',
    gender: '♂',
    age: 25,
    city: '北京',
    bio: '健身爱好者',
    followers: 100,
    following: 50,
    posts: 10,
    cert: false,
  };
}

export const UserProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = parseInt(id || '0', 10);
  const { isFollowing, toggleFollow } = useSocialStore();

  const mockUser = useMemo(() => getUserFromId(userId), [userId]);
  const [user, setUser] = useState(mockUser);

  useEffect(() => {
    dataService.getUser(userId).then((u) => {
      if (u) {
        setUser({
          id: u.id ?? userId,
          name: u.name ?? `用户${userId}`,
          avatar: u.avatar ?? (u.name?.[0] ?? 'U'),
          color: u.color ?? '#C8FF00',
          gender: u.gender ?? '♂',
          age: u.age ?? 25,
          city: u.city ?? '北京',
          bio: u.bio ?? '健身爱好者',
          followers: u.followers ?? 0,
          following: u.following ?? 0,
          posts: u.posts ?? 0,
          cert: u.isCoach ?? false,
        });
      }
    });
  }, [userId]);

  const userPosts = useMemo(
    () => FEED_DATA.filter((p) => p.username === user.name),
    [user.name]
  );
  const userMeets = useMemo(
    () => MEET_DATA.filter((m) => m.username === user.name.split('·')[0].trim()),
    [user.name]
  );
  // Load real data when available
  const [apiPosts, setApiPosts] = useState<typeof FEED_DATA>([]);
  const [apiMeets, setApiMeets] = useState<typeof MEET_DATA>([]);

  useEffect(() => {
    dataService.getFeed().then((posts) => {
      const filtered = posts.filter((p) => p.username === user.name);
      if (filtered.length > 0) setApiPosts(filtered);
    });
    dataService.getMeets().then((meets) => {
      const filtered = meets.filter((m) => m.username === user.name);
      if (filtered.length > 0) setApiMeets(filtered);
    });
  }, [user.name, userId]);

  const displayPosts = apiPosts.length > 0 ? apiPosts : userPosts;
  const displayMeets = apiMeets.length > 0 ? apiMeets : userMeets;  const following = isFollowing(userId);

  return (
    <div className="min-h-screen pb-20">
      {/* Back */}
      <div className="sticky top-16 z-40 border-b border-border bg-base/95 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <button
            className="text-textMuted hover:text-white transition cursor-pointer"
            onClick={() => navigate(-1)}
          >
            ← 返回
          </button>
          <span className="text-sm font-display font-bold text-white">{user.name}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6">
        {/* Profile Header */}
        <div className="py-8 flex items-start gap-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-display font-bold text-[#09090A] flex-shrink-0"
            style={{ background: user.color }}
          >
            {user.avatar}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-display font-extrabold text-white">{user.name}</h1>
              {user.cert && <span className="text-lime text-sm">✓ 已认证</span>}
            </div>
            <div className="text-xs text-textSofter mb-2">
              {user.gender} {user.age}岁 · 📍 {user.city}
            </div>
            <p className="text-sm text-textMuted mb-4">{user.bio}</p>

            {/* Stats */}
            <div className="flex gap-6 mb-4">
              <div className="text-center">
                <div className="text-lg font-bold text-white">{user.posts}</div>
                <div className="text-[11px] text-textSofter">动态</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">{user.followers}</div>
                <div className="text-[11px] text-textSofter">粉丝</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">{user.following}</div>
                <div className="text-[11px] text-textSofter">关注</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                className={`px-6 py-2 rounded-full text-sm font-bold transition cursor-pointer ${
                  following
                    ? 'bg-surfaceMuted text-textMuted border border-border hover:border-red-500 hover:text-red-400'
                    : 'bg-lime text-[#09090A] hover:bg-[#d4ff1a] hover:shadow-glow'
                }`}
                onClick={() => toggleFollow(userId)}
              >
                {following ? '✓ 已关注' : '+ 关注'}
              </button>
              <button
                className="px-6 py-2 rounded-full text-sm font-semibold bg-surface border border-border text-white hover:border-borderStrong transition cursor-pointer"
                onClick={() => navigate('/messages')}
              >
                💬 私信
              </button>
            </div>
          </div>
        </div>

        {/* User's Posts */}
        {displayPosts.length > 0 && (
          <section className="mb-8">
            <h3 className="font-display font-bold text-white mb-4">📝 TA的动态</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayPosts.map((post) => (
                <div
                  key={post.id}
                  className="p-4 rounded-xl border border-border bg-surface hover:border-borderStrong transition"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{post.emoji}</span>
                    <div>
                      <div className="text-sm font-semibold text-white">{post.username}</div>
                      <div className="text-[11px] text-textSofter">📍 {post.city} · {post.dist}</div>
                    </div>
                  </div>
                  <p className="text-sm text-textMuted leading-relaxed">{post.text}</p>
                  <div className="flex gap-3 mt-2 text-xs text-textSofter">
                    <span>❤️ {post.likes}</span>
                    <span>💬 {post.comments}</span>
                    <span>👁️ {post.viewCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* User's Meets */}
        {displayMeets.length > 0 && (
          <section className="mb-8">
            <h3 className="font-display font-bold text-white mb-4">📍 TA的约练</h3>
            <div className="space-y-3">
              {displayMeets.map((meet) => (
                <div
                  key={meet.id}
                  className="p-4 rounded-xl border border-border bg-surface hover:border-borderStrong transition cursor-pointer"
                  onClick={() => navigate('/meet')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meet.sport.split(' ')[0]}</span>
                      <span className="text-sm font-semibold text-white">{meet.title}</span>
                    </div>
                    <span className="text-xs text-lime bg-limeDim px-2 py-0.5 rounded-full">
                      {meet.slots}/{meet.maxSlots} 人
                    </span>
                  </div>
                  <div className="text-xs text-textSofter mt-1">
                    ⏰ {meet.time} · 📍 {meet.loc}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {displayPosts.length === 0 && displayMeets.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-lg font-display font-bold text-textMuted">暂无内容</div>
            <div className="text-sm text-textSofter mt-1">这位用户还没有发布任何动态</div>
          </div>
        )}
      </div>
    </div>
  );
};
