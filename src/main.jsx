import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import Root from './App';
import './styles.css';

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) {
      window.setInterval(() => registration.update(), 60 * 60 * 1000);
    }
  },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
