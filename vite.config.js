import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig({
  define: {
    // Provide a minimal browser-friendly `process.env` object so
    // libraries that reference `process.env.*` don't crash at runtime.
    'process.env': {},
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
      // Keep React and other large libs external so Argo CD provides them.
      // Argo CD 3.5+ also requires externalizing react/jsx-runtime: dependencies
      // (e.g. MUI, Emotion) import the automatic JSX runtime directly, and if it
      // gets bundled it reaches into React internals removed in React 19, which
      // crashes the extension at load time in the host.
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'moment'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-dom/client': 'ReactDOM',
          'react/jsx-runtime': 'ReactJSXRuntime',
          moment: 'Moment'
        }
      }
    }
  }
});
