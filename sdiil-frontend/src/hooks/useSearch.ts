import { useState, useCallback } from 'react';
import { RAGSearchResponse } from '@/types/document.types';
import { searchService } from '@/services/search.service';
import { useAuth } from './useAuth';

export function useSearch(caseId: string) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RAGSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeSearch = useCallback(
    async (searchQuery?: string) => {
      const q = (searchQuery ?? query).trim();
      if (!q) return;

      if (!user) {
        setError('Authentication required');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const res = await searchService.search(
          caseId,
          q,
          user.role,
          user.user_id,
          user.full_name || user.username
        );
        setResult(res);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setIsLoading(false);
      }
    },
    [caseId, query, user]
  );

  const clear = () => {
    setQuery('');
    setResult(null);
    setError(null);
  };

  return {
    query,
    setQuery,
    result,
    isLoading,
    error,
    executeSearch,
    clear,
  };
}
