import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SAMPLE_COMMENTS } from '../data/mockData';
import type { Comment } from '../types';
import { sanitizeInput } from '../lib/utils';
import * as dataService from '../services/dataService';

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

const COLORS = ['#C8FF00', '#FF6B9D', '#A78BFA', '#F97316', '#38BDF8', '#22C55E'];

const INITIAL_COMMENTS: Record<number, Comment[]> = {
  1: SAMPLE_COMMENTS.slice(0, 2),
  2: SAMPLE_COMMENTS.slice(1, 4),
  4: SAMPLE_COMMENTS.slice(0, 3),
};

export const useSocialStore = create<SocialState>()(
  persist(
    (set, get) => ({
      followedUsers: [],
      likedPosts: [],
      savedPosts: [],
      likeDelta: {},
      comments: INITIAL_COMMENTS,
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
        } catch {
          // Keep local state if API fails
        }
      },

      loadComments: async (postId) => {
        try {
          const comments = await dataService.getComments(postId);
          if (comments.length > 0) {
            set((state) => ({
              comments: { ...state.comments, [postId]: comments },
            }));
          }
        } catch {
          // keep local
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
        dataService.toggleFollow(userId);
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
        dataService.likePost(postId);
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
        dataService.savePost(postId);
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
        dataService.addComment(postId, safeText);
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
        dataService.likeComment(commentId);
      },
    }),
    {
      name: 'fitmate-social',
    },
  ),
);
