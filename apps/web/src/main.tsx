import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { routes } from './app/routes.tsx';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(routes)} />
  </StrictMode>,
);

// The app has started: fade the first-load splash out, then remove it.
const splash = document.getElementById('boot-splash');
if (splash) {
  requestAnimationFrame(() => splash.classList.add('boot-splash--done'));
  splash.addEventListener('animationend', () => splash.remove(), { once: true });
  window.setTimeout(() => splash.remove(), 1000);
}
