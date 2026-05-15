import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Comment } from '../types';
import { sanitizeInput } from '../lib/utils';
import * as dataService from '../services/dataService';
import { STORAGE_KEYS, migrateLocalStorageKey } from '../lib/storageKeys';

migrateLocalStorageKey(STORAGE_KEYS.legacySocialStore, STORAGE_KEYS.socialStore);

interface SocialState {
  followedUsers: number[];
  likedPosts: number[];
  savedPosts: number[];
  /** Track like-count deltas: postId → adjustment (+1 or -1 from original) */
  likeDelta: Record<number, number>;
  comments: Record<number, Comment[]>;
  /** Whether initial server state has been loaded */
  _synced: boolean;

  toggleFollow: (userId: number) => void;
  isFollowing: (userId: number) => boolean;
  toggleLike: (postId: number) => void;
  isLiked: (postId: number) => boolean;
  getLikeDelta: (postId: number) => number;
  toggleSave: (postId: number) => void;
  isSaved: (postId: number) => boolean;
  addComment: (postId: number, text: string, username: string) => void;
  getComments: (postId: number) => Comment[];
  likeComment: (postId: number, commentId: number) => void;
  /** Load initial liked/saved/followed state from server */
  syncFromServer: () => Promise<void>;
  /** Load comments for a specific post from server */
  loadComments: (postId: number) => Promise<void>;
}

const COLORS = ['#FF6A00', '#F97316', '#FFB000', '#EF4444', '#16C784', '#38BDF8'];

export const useSocialStore = create<SocialState>()(
  persist(
    (set, get) => ({
      followedUsers: [],
      likedPosts: [],
      savedPosts: [],
      likeDelta: {},
      comments: {},
      _synced: false,

      syncFromServer: async () => {
        if (get()._synced) return;
        try {
          const [interactions, followedIds] = await Promise.all([
            dataService.getPostInteractions(),
            dataService.getFollowedIds(),
          ]);
          set({
            likedPosts: interactions.likedPostIds ?? [],
            savedPosts: interactions.savedPostIds ?? [],
            followedUsers: followedIds ?? [],
            likeDelta: {},
            _synced: true,
          });
        } catch (error) {
          console.error('Failed to sync social state', error);
        }
      },

      loadComments: async (postId) => {
        try {
          const comments = await dataService.getComments(postId);
          set((state) => ({
            comments: { ...state.comments, [postId]: comments },
          }));
        } catch (error) {
          console.error('Failed to load comments', error);
        }
      },

      toggleFollow: (userId) => {
        set((state) => {
          const idx = state.followedUsers.indexOf(userId);
          if (idx >= 0) {
            return { followedUsers: state.followedUsers.filter((id) => id !== userId) };
          }
          return { followedUsers: [...state.followedUsers, userId] };
        });
        // Sync with backend
        dataService.toggleFollow(userId).catch((error) => {
          console.error('Failed to sync follow state', error);
        });
      },

      isFollowing: (userId) => get().followedUsers.includes(userId),

      toggleLike: (postId) => {
        set((state) => {
          const idx = state.likedPosts.indexOf(postId);
          const currentDelta = state.likeDelta[postId] || 0;
          if (idx >= 0) {
            return {
              likedPosts: state.likedPosts.filter((id) => id !== postId),
              likeDelta: { ...state.likeDelta, [postId]: currentDelta - 1 },
            };
          }
          return {
            likedPosts: [...state.likedPosts, postId],
            likeDelta: { ...state.likeDelta, [postId]: currentDelta + 1 },
          };
        });
        // Sync with backend
        dataService.likePost(postId).catch((error) => {
          console.error('Failed to sync like state', error);
        });
      },

      isLiked: (postId) => get().likedPosts.includes(postId),

      getLikeDelta: (postId) => get().likeDelta[postId] || 0,

      toggleSave: (postId) => {
        set((state) => {
          const idx = state.savedPosts.indexOf(postId);
          if (idx >= 0) {
            return { savedPosts: state.savedPosts.filter((id) => id !== postId) };
          }
          return { savedPosts: [...state.savedPosts, postId] };
        });
        // Sync with backend
        dataService.savePost(postId).catch((error) => {
          console.error('Failed to sync save state', error);
        });
      },

      isSaved: (postId) => get().savedPosts.includes(postId),

      addComment: (postId, text, username) => {
        const safeText = sanitizeInput(text, 500);
        if (!safeText) return;
        const newComment: Comment = {
          id: Date.now(),
          username,
          avatar: username[0],
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          text: safeText,
          time: '刚刚',
          likes: 0,
        };
        set((state) => ({
          comments: {
            ...state.comments,
            [postId]: [...(state.comments[postId] || []), newComment],
          },
        }));
        // Sync with backend
        dataService.addComment(postId, safeText).catch((error) => {
          console.error('Failed to sync comment', error);
        });
      },

      getComments: (postId) => get().comments[postId] || [],

      likeComment: (postId, commentId) => {
        set((state) => ({
          comments: {
            ...state.comments,
            [postId]: (state.comments[postId] || []).map((c) =>
              c.id === commentId ? { ...c, likes: c.likes + 1 } : c
            ),
          },
        }));
        // Sync with backend
        dataService.likeComment(commentId).catch((error) => {
          console.error('Failed to sync comment like', error);
        });
      },
    }),
    {
      name: STORAGE_KEYS.socialStore,
    },
  ),
);
