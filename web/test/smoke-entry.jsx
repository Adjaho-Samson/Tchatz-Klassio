import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App.jsx';

window.__renderApp = () => {
  const root = createRoot(document.getElementById('root'));
  root.render(React.createElement(App));
};
