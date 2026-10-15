import { createRoot } from 'react-dom/client';
import { ErpApp } from './erp/ErpApp';
import { onErpSite } from './erp/model';
import { App } from './ui/App';
import './styles.css';

try {
  const t = localStorage.getItem('fluid-erp:theme');
  if (t) document.documentElement.dataset.theme = t;
} catch { /* storage unavailable */ }

// Served by the fluid_erp app inside an ERPNext site → live ERPNext data; anywhere else → demo company.
createRoot(document.getElementById('root')!).render(onErpSite() ? <ErpApp /> : <App />);
