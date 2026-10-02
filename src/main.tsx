import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/silkscreen';
import './styles.css';
import App from './App.tsx';
import { load, storage } from './lib/store.ts';
import { seedDB } from './lib/seed.ts';

load(seedDB).then(() => {
  // Hosted build only: cache the app shell so it opens without a connection.
  if (storage.get() === 'cloud' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
});
createRoot(document.getElementById('root')!).render(<App />);
