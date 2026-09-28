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
  query: string;
  position: Position | null;
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
  query,
  position,
  onClose,
  onSelect,
  authToken,
}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!isOpen || normalizedQuery.length < 2) {
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
          `http://127.0.0.1:3000/api/search?q=${encodeURIComponent(normalizedQuery)}`,
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
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authToken, isOpen, query]);

  const visibleResults = query.trim().length >= 2 ? results : [];
  const visibleError = query.trim().length >= 2 ? error : null;
  const visibleLoading = isOpen && query.trim().length >= 2 && loading;

  if (!isOpen || !position) {
    return null;
  }

  const modalPosition: React.CSSProperties = {
    position: 'fixed',
    top: Math.max(8, Math.min(position.top, window.innerHeight - 288)),
    left: position.left,
    width: position.width,
    maxHeight: Math.max(120, window.innerHeight - position.top - 12),
    zIndex: 2147483647,
  };

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
    <>
      <style>{`
        .ember-power-select-dropdown,
        .ac-dropdown,
        .ember-basic-dropdown-content-placeholder {
          display: none !important;
        }
      `}</style>
      <div className="ensearch-overlay ensearch-autocomplete-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
        <section
          aria-label={`Search results for ${query}`}
          aria-live="polite"
          className="ensearch-search-modal is-positioned"
          style={modalPosition}
          onClick={(event) => event.stopPropagation()}
          role="listbox"
        >
          <p className="ensearch-autocomplete-heading">
            Results for “{query.trim().toLocaleUpperCase()}”
          </p>
          <div className="ensearch-search-results">
          {visibleLoading && <p className="ensearch-search-message" role="status">Searching...</p>}
          {visibleError && <p className="ensearch-search-message ensearch-search-error" role="alert">{visibleError}</p>}
          {!visibleLoading && !visibleError && visibleResults.length === 0 && (
            <p className="ensearch-search-message">No matching items.</p>
          )}
          {visibleResults.map((item, index) => (
            <button
              aria-selected={index === activeIndex}
              className={`ensearch-result${index === activeIndex ? ' is-active' : ''}`}
              id={`ensearch-result-${index}`}
              key={item.id}
              role="option"
              type="button"
              onClick={() => {
                onSelect(item);
                onClose();
              }}
              onMouseEnter={() => setActiveIndex(index)}
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
    </>
  );
};