import { createRoot } from 'react-dom/client';
import { fontsReady } from './fonts';
import './app.css';

if (location.hash === '#headless') {
  fontsReady().then(() => import('./headless')).then((m) => m.runHeadless());
} else {
  fontsReady().finally(async () => {
    const { App } = await import('./App');
    createRoot(document.getElementById('root')!).render(<App />);
  });
}
