import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Modes:
//   (default) dev server / plain build into dist/
//   frappe    build into the Frappe app: assets → fluid_erp/public/fluid, page → fluid_erp/www/fluid.html
//   single    one self-contained HTML file (shareable demo)
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  base: mode === 'frappe' ? '/assets/fluid_erp/fluid/' : '/',
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'frappe' ? '../fluid_erp/public/fluid' : 'dist',
    emptyOutDir: true,
  },
}));
