import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { SearchModal, type SearchResult } from './components/SearchModal';
import { injectSelectedItemIntoZoho } from './utils/zohoDom';

const MainApp = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const zohoInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();

        if (isOpen) {
          setIsOpen(false);
          return;
        }

        const activeElement = document.activeElement;
        zohoInputRef.current =
          activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
            ? activeElement
            : null;
        setInitialQuery(zohoInputRef.current?.value ?? '');
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (item: SearchResult) => {
    injectSelectedItemIntoZoho(item, zohoInputRef.current);
  };

  return (
    <SearchModal
      isOpen={isOpen}
      initialQuery={initialQuery}
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