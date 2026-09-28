import { useEffect, useRef, useState } from 'react';
import { SearchModal, type SearchResult } from './SearchModal';
import { injectSelectedItemIntoZoho } from '../utils/zohoDom';

interface InputPosition {
  top: number;
  left: number;
  width: number;
}

const hideZohoNativePopovers = (): (() => void) => {
  const popovers = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.ac-dropdown, .ember-power-select-dropdown, .popover'
    )
  );
  const originalDisplays = popovers.map((popover) => [popover, popover.style.display] as const);

  popovers.forEach((popover) => {
    popover.style.display = 'none';
  });

  return () => {
    originalDisplays.forEach(([popover, display]) => {
      if (popover.isConnected) {
        popover.style.display = display;
      }
    });
  };
};

function ContentApp() {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const [position, setPosition] = useState<InputPosition | null>(null);
  const zohoInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const restorePopoversRef = useRef<(() => void) | null>(null);

  const closeSearch = () => {
    restorePopoversRef.current?.();
    restorePopoversRef.current = null;
    setIsOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (isOpen) {
          closeSearch();
          zohoInputRef.current = null;
          return;
        }

        restorePopoversRef.current?.();
        restorePopoversRef.current = hideZohoNativePopovers();

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
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      restorePopoversRef.current?.();
      restorePopoversRef.current = null;
    };
  }, [isOpen]);

  const handleSelect = (item: SearchResult) => {
    injectSelectedItemIntoZoho(item, zohoInputRef.current);
  };

  return (
    <SearchModal
      key={`${isOpen}:${initialQuery}`}
      isOpen={isOpen}
      initialQuery={initialQuery}
      position={position}
      onClose={closeSearch}
      onSelect={handleSelect}
    />
  );
}

export default ContentApp;