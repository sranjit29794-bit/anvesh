import React from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface SearchBarProps {
  query: string;
  setQuery: (q: string) => void;
  onSearch: (q?: string) => void;
  isLoading: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  setQuery,
  onSearch,
  isLoading,
}) => {
  const suggestedQueries = [
    'What was the money trail mentioned in the protected deposition?',
    'What did the FSL forensic hard drive analysis recover?',
    'Show statutory notices served under Sec 91 CrPC',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <div className="w-full space-y-3">
      <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask natural language question against case evidence (e.g. 'What offshore accounts were named?')..."
            className="w-full pl-10 pr-4 py-3 bg-bg-elevated text-text-primary placeholder:text-text-muted border border-border rounded-card text-body outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors"
            maxLength={500}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          leftIcon={<Sparkles className="w-4 h-4" />}
          className="shrink-0"
        >
          Run RAG Query
        </Button>
      </form>

      {/* Suggested Queries */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[11px] font-mono text-text-muted uppercase">Sample Prompts:</span>
        {suggestedQueries.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setQuery(prompt);
              onSearch(prompt);
            }}
            className="text-text-secondary hover:text-text-primary bg-bg-card hover:bg-bg-elevated border border-border px-2.5 py-1 rounded-full transition-colors truncate max-w-[280px] sm:max-w-none text-[11px]"
          >
            "{prompt}"
          </button>
        ))}
      </div>
    </div>
  );
};
