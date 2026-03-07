import { request } from './client';

export interface SearchResult {
  users: Array<{ id: number; name: string; avatar: string; type: 'user' }>;
  posts: Array<{ id: number; content: string; author: string; type: 'post' }>;
  coaches: Array<{ id: number; name: string; title: string; type: 'coach' }>;
}

export const searchApi = {
  search: async (query: string): Promise<SearchResult> => {
    return request<SearchResult>(`/search?q=${encodeURIComponent(query)}`);
  },

  suggest: async (query: string): Promise<string[]> => {
    return request<string[]>(`/search/suggest?q=${encodeURIComponent(query)}`);
  }
};
