import React, { useEffect, useState } from 'react';
import './SearchModal.css';

export interface SearchResult {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  rate: number;
  matchType: string;
  score: number;
}

interface SearchApiMatch {
  item?: {
    id?: unknown;
    name?: unknown;
    sku?: unknown;
    description?: unknown;
    rate?: unknown;
  };
  matchType?: unknown;
  score?: unknown;
}

interface SearchApiResponse {
  matches?: SearchApiMatch[];
  error?: string;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

interface Props {
  isOpen: boolean;
  initialQuery?: string;
  position?: Position | null;
  onClose: () => void;
  onSelect: (item: SearchResult) => void;
  authToken?: string | null;
}

function parseMatches(matches: SearchApiMatch[] | undefined): SearchResult[] {
  if (!Array.isArray(matches)) {
    return [];
  }

  return matches.flatMap((match) => {
    const item = match.item;
    if (
      typeof item?.id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.rate !== 'number' ||
      typeof match.matchType !== 'string' ||
      typeof match.score !== 'number'
    ) {
      return [];
    }

    return [{
      id: item.id,
      name: item.name,
      ...(typeof item.sku === 'string' ? { sku: item.sku } : {}),
      ...(typeof item.description === 'string' ? { description: item.description } : {}),
      rate: item.rate,
      matchType: match.matchType,
      score: match.score,
    }];
  });
}

export const SearchModal: React.FC<Props> = ({
  isOpen,
  initialQuery = '',
  position = null,
  onClose,
  onSelect,
  authToken,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!isOpen || !normalizedQuery) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      setResults([]);

      try {
        const headers = new Headers();
        if (authToken) {
          headers.set('Authorization', `Bearer ${authToken}`);
        }

        const response = await fetch(
          `http://localhost:3000/api/search?q=${encodeURIComponent(normalizedQuery)}`,
          { headers, signal: controller.signal }
        );
        const data = await response.json() as SearchApiResponse;

        if (!response.ok) {
          throw new Error(data.error ?? `Search request failed (${response.status})`);
        }

        const nextResults = parseMatches(data.matches);
        setResults(nextResults);
        setActiveIndex(0);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(requestError instanceof Error ? requestError.message : 'Search failed');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authToken, isOpen, query]);

  const visibleResults = query.trim() ? results : [];
  const visibleError = query.trim() ? error : null;
  const visibleLoading = isOpen && Boolean(query.trim()) && loading;

  if (!isOpen) {
    return null;
  }

  const modalPosition: React.CSSProperties | undefined = position
    ? {
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: position.width,
        maxHeight: Math.max(120, window.innerHeight - position.top - 12),
      }
    : undefined;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown' && visibleResults.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % visibleResults.length);
    } else if (event.key === 'ArrowUp' && visibleResults.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + visibleResults.length) % visibleResults.length);
    } else if (event.key === 'Enter' && visibleResults[activeIndex]) {
      event.preventDefault();
      onSelect(visibleResults[activeIndex]);
      onClose();
    }
  };

  return (
    <div className="ensearch-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <section
        aria-label="Search Zoho Books items"
        aria-modal="true"
        className={`ensearch-search-modal${position ? ' is-positioned' : ''}`}
        style={modalPosition}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <label className="ensearch-search-label" htmlFor="ensearch-search-input">
          Item search
        </label>
        <input
          autoFocus
          id="ensearch-search-input"
          className="ensearch-search-input"
          type="search"
          placeholder="Search by item, alias, or SKU"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-controls="ensearch-search-results"
          aria-activedescendant={visibleResults[activeIndex] ? `ensearch-result-${activeIndex}` : undefined}
        />

        <div id="ensearch-search-results" className="ensearch-search-results" role="listbox">
          {visibleLoading && <p className="ensearch-search-message" role="status">Searching...</p>}
          {visibleError && <p className="ensearch-search-message ensearch-search-error" role="alert">{visibleError}</p>}
          {!visibleLoading && !visibleError && query.trim() && visibleResults.length === 0 && (
            <p className="ensearch-search-message">No matching items.</p>
          )}
          {!query.trim() && (
            <p className="ensearch-search-message">Start typing to search your catalog.</p>
          )}
          {visibleResults.map((item, index) => (
            <button
              aria-selected={index === activeIndex}
              className={`ensearch-result${index === activeIndex ? ' is-active' : ''}`}
              id={`ensearch-result-${index}`}
              key={item.id}
              onClick={() => {
                onSelect(item);
                onClose();
              }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span className="ensearch-result-copy">
                <span className="ensearch-result-name">{item.name}</span>
                <span className="ensearch-result-meta">
                  {item.sku ? `SKU ${item.sku}` : 'No SKU'}
                  <span aria-hidden="true"> · </span>
                  {item.matchType} match · {(item.score * 100).toFixed(0)}%
                </span>
              </span>
              <span className="ensearch-result-rate">{item.rate.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};