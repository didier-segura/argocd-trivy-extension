import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' }), cssInjectedByJsPlugin()],
  build: {
    outDir: 'dist/resources/extension-trivy.js',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.jsx',
      name: 'tmp.extensions',
      fileName: () => 'extension-trivy.js',
      formats: ['iife']
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'moment'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-dom/client': 'ReactDOM',
          moment: 'Moment'
        }
      }
    }
  }
});
