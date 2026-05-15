import { useState, useCallback, useEffect } from 'react';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileStats } from '../components/profile/ProfileStats';
import { ProfileCoach } from '../components/profile/ProfileCoach';
import { ProfileMeets } from '../components/profile/ProfileMeets';
import { ProfilePosts } from '../components/profile/ProfilePosts';
import { ProfileSettings } from '../components/profile/ProfileSettings';
import { useAuthStore, useNotificationStore } from '../stores';
import * as dataService from '../services/dataService';
import type { Post, MeetRecord } from '../types';

type TabId = 'overview' | 'posts' | 'meets' | 'settings';

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: '概览', icon: '📊' },
  { id: 'posts', label: '动态', icon: '📝' },
  { id: 'meets', label: '约练', icon: '📍' },
  { id: 'settings', label: '设置', icon: '⚙️' },
];

export const ProfilePage = () => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { user, openLogin, updateProfile, refreshProfile } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [meetRecords, setMeetRecords] = useState<MeetRecord[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [profileContentError, setProfileContentError] = useState('');

  const fetchProfileContent = useCallback(async () => {
    if (!user) return;
    const [posts, records] = await Promise.all([
      dataService.getFeed(),
      dataService.getMeetRecords(),
    ]);
    return {
      posts: posts.filter((p) => p.userId === user.id || p.username === user.name),
      records,
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchProfileContent();
        if (cancelled || !result) return;
        setProfileContentError('');
        setMyPosts(result.posts);
        setMeetRecords(result.records);
      } catch {
        if (cancelled) return;
        setMyPosts([]);
        setMeetRecords([]);
        setProfileContentError('加载个人内容失败，请重试');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchProfileContent]);

  const loadProfileContent = useCallback(async () => {
    try {
      const result = await fetchProfileContent();
      if (!result) return;
      setProfileContentError('');
      setMyPosts(result.posts);
      setMeetRecords(result.records);
    } catch {
      setMyPosts([]);
      setMeetRecords([]);
      setProfileContentError('加载个人内容失败，请重试');
    }
  }, [fetchProfileContent]);
  const [editName, setEditName] = useState(user?.name || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [successMsg, setSuccessMsg] = useState('');

  const handleEditProfile = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleSaveProfile = useCallback(() => {
    if (!user) return;
    updateProfile({ name: editName.trim() || user.name, bio: editBio.trim() });
    addNotification({
      type: 'system',
      username: '系统',
      avatar: 'S',
      color: '#38BDF8',
      text: '个人资料已更新',
      time: '刚刚',
    });
    setIsEditing(false);
    setSuccessMsg('资料已更新！');
    setTimeout(() => setSuccessMsg(''), 3000);
  }, [editName, editBio, user, updateProfile, addNotification]);

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-textMuted text-lg">请先登录查看个人资料</p>
          <button
            onClick={openLogin}
            className="cursor-pointer rounded-lg bg-lime px-6 py-2 font-bold text-white transition hover:bg-brand2"
          >
            登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Profile Header */}
      <ProfileHeader profile={user} onEdit={handleEditProfile} />

      {/* Tab Navigation */}
      <div className="sticky top-[72px] z-40 border-b border-white/10 bg-[#100b08]/95 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`flex-1 py-3.5 text-sm font-display font-semibold transition cursor-pointer border-b-2 ${
                activeTab === tab.id
                ? 'text-lime border-lime'
                : 'text-textMuted border-transparent hover:text-white'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-4xl mx-auto px-6 pt-6">
        {profileContentError && (
          <div
            className="mb-4 flex items-center justify-between rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
            aria-live="assertive"
          >
            <span>{profileContentError}</span>
            <button
              className="underline underline-offset-2 hover:text-white cursor-pointer"
              onClick={() => {
                void loadProfileContent();
              }}
            >
              重试
            </button>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <ProfileStats profile={user} />
            {user.isCoach && <ProfileCoach profile={user} />}
          </div>
        )}

        {activeTab === 'posts' && (
          <ProfilePosts posts={myPosts} />
        )}

        {activeTab === 'meets' && (
          <ProfileMeets records={meetRecords} />
        )}

        {activeTab === 'settings' && (
          <ProfileSettings
            profile={user}
            onVerificationApproved={refreshProfile}
          />
        )}
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsEditing(false)}>
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-display font-bold text-white">编辑资料</h3>
            <div>
              <label className="text-xs text-textMuted mb-1 block">昵称</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-lime/30"
              />
            </div>
            <div>
              <label className="text-xs text-textMuted mb-1 block">简介</label>
              <textarea
                value={editBio}
                onChange={e => setEditBio(e.target.value)}
                rows={3}
                className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-lime/30 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                className="flex-1 py-2 rounded-lg border border-border text-textMuted text-sm hover:text-white transition cursor-pointer"
                onClick={() => setIsEditing(false)}
              >
                取消
              </button>
              <button
                className="flex-1 cursor-pointer rounded-lg bg-lime py-2 text-sm font-bold text-white transition hover:bg-brand2"
                onClick={handleSaveProfile}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Success Toast */}
      {successMsg && (
        <div className="fixed left-1/2 top-20 z-[100] -translate-x-1/2 rounded-xl bg-lime px-6 py-3 text-sm font-bold text-white shadow-glow">
          ✅ {successMsg}
        </div>
      )}
    </div>
  );
};
