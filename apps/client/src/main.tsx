import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { NotFoundPage } from './pages/NotFoundPage';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The server marks the page it sends for an unknown address (apps/server/src/http/index-page.ts).
const notFound = document.documentElement.dataset.page === 'not-found';

createRoot(root).render(<StrictMode>{notFound ? <NotFoundPage /> : <App />}</StrictMode>);
