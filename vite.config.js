import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import path from 'path';

export default defineConfig({
  define: {
    // Provide a minimal browser-friendly `process.env` object so
    // libraries that reference `process.env.*` don't crash at runtime.
    'process.env': {},
  },
  resolve: {
    alias: {
      'react/jsx-runtime': path.resolve(__dirname, 'src/jsx-runtime-alias.js')
    }
  },
  plugins: [react({ jsxRuntime: 'classic' }), cssInjectedByJsPlugin()],
  build: {
    outDir: 'dist/resources',
    emptyOutDir: true,
    // Ensure Vite emits a single file (no code splitting)
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.jsx',
      name: 'ArgocdTrivyExtension',
      // UMD is preferred so Argo CD can load the bundle as a single script
      formats: ['umd'],
      fileName: () => 'extension.js'
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
