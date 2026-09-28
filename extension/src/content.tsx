import React from 'react';
import ReactDOM from 'react-dom/client';
import ContentApp from './components/ContentApp';

const rootElement = document.createElement('div');
rootElement.id = 'ensearch-extension-root';
document.body.appendChild(rootElement);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ContentApp />
  </React.StrictMode>
);