import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/silkscreen';
import './styles.css';
import App from './App.tsx';
import { load, storage } from './lib/store.ts';
import { seedDB } from './lib/seed.ts';
import { native } from './lib/platform.ts';
import { initNative } from './lib/native.ts';

if (native) initNative();
load(seedDB).then(() => {
  // Hosted website only: cache the app shell so it opens without a connection. The Android app ships its own files
  // and never registers a service worker.
  if (!native && storage.get() === 'cloud' && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
});
createRoot(document.getElementById('root')!).render(<App />);
