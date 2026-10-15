import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

try {
  const t = localStorage.getItem('fluid-erp:theme');
  if (t) document.documentElement.dataset.theme = t;
} catch { /* storage unavailable */ }

createRoot(document.getElementById('root')!).render(<App />);
