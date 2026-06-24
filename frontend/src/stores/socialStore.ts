import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as dataService from '../services/dataService';
import { STORAGE_KEYS, migrateLocalStorageKey } from '../lib/storageKeys';

migrateLocalStorageKey(STORAGE_KEYS.legacySocialStore, STORAGE_KEYS.socialStore);

interface SocialState {
  followedUsers: number[];
  _synced: boolean;
  toggleFollow: (userId: number) => void;
  isFollowing: (userId: number) => boolean;
  syncFromServer: () => Promise<void>;
}

export const useSocialStore = create<SocialState>()(
  persist(
    (set, get) => ({
      followedUsers: [],
      _synced: false,

      syncFromServer: async () => {
        if (get()._synced) return;
        try {
          const followedIds = await dataService.getFollowedIds();
          set({ followedUsers: followedIds ?? [], _synced: true });
        } catch (error) {
          console.error('Failed to sync follow state', error);
        }
      },

      toggleFollow: (userId) => {
        set((state) => {
          const isFollowing = state.followedUsers.includes(userId);
          return {
            followedUsers: isFollowing
              ? state.followedUsers.filter((id) => id !== userId)
              : [...state.followedUsers, userId],
          };
        });
        dataService.toggleFollow(userId).catch((error) => {
          console.error('Failed to sync follow state', error);
        });
      },

      isFollowing: (userId) => get().followedUsers.includes(userId),
    }),
    {
      name: STORAGE_KEYS.socialStore,
    },
  ),
);
