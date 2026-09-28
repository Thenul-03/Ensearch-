import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { SearchModal, type SearchResult } from './components/SearchModal';
import { injectSelectedItemIntoZoho } from './utils/zohoDom';

interface InputPosition {
  top: number;
  left: number;
  width: number;
}

const MainApp = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const [position, setPosition] = useState<InputPosition | null>(null);
  const zohoInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (isOpen) {
          zohoInputRef.current = null;
          setIsOpen(false);
          return;
        }

        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
          zohoInputRef.current = activeElement;
          setInitialQuery(activeElement.value || '');

          const rect = activeElement.getBoundingClientRect();
          const width = Math.min(Math.max(rect.width, 450), Math.max(240, window.innerWidth - 24));
          setPosition({
            top: rect.bottom + 4,
            left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
            width,
          });
        } else {
          zohoInputRef.current = null;
          setInitialQuery('');
          setPosition(null);
        }

        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  const handleSelect = (item: SearchResult) => {
    injectSelectedItemIntoZoho(item, zohoInputRef.current);
  };

  return (
    <SearchModal
      isOpen={isOpen}
      initialQuery={initialQuery}
      position={position}
      onClose={() => setIsOpen(false)}
      onSelect={handleSelect}
    />
  );
};

const rootElement = document.createElement('div');
rootElement.id = 'ensearch-extension-root';
document.body.appendChild(rootElement);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MainApp />
  </React.StrictMode>
);