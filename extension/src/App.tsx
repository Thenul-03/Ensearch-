import { useEffect, useRef, useState } from 'react';
import { SearchModal, type SearchResult } from './components/SearchModal';
import { injectSelectedItemIntoZoho } from './utils/zohoDom';

function App() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const zohoInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const activeElement = document.activeElement;
        zohoInputRef.current =
          activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
            ? activeElement
            : null;
        setIsSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  const handleSelect = (item: SearchResult) => {
    injectSelectedItemIntoZoho(item, zohoInputRef.current);
  };

  return (
    <SearchModal
      isOpen={isSearchOpen}
      onClose={() => setIsSearchOpen(false)}
      onSelect={handleSelect}
    />
  );
}

export default App
