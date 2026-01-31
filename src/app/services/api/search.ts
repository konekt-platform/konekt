import { Event, User } from '../../types';
import { apiFetch } from './client';

export interface SearchFilters {
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchResult {
  events: Event[];
  users: User[];
}

export interface SearchHistoryEntry {
  query: string;
  type: string;
  timestamp: string;
}

export const searchRequest = async (
  query: string,
  type: 'all' | 'events' | 'users' = 'all',
  filters?: SearchFilters
): Promise<SearchResult> => {
  const params = new URLSearchParams({
    q: query,
    type,
  });
  
  if (filters) {
    params.append('filters', JSON.stringify(filters));
  }
  
  return apiFetch<SearchResult>(`/search?${params.toString()}`);
};

export const getSearchHistoryRequest = async (): Promise<SearchHistoryEntry[]> => {
  return apiFetch<SearchHistoryEntry[]>('/users/me/search-history');
};

