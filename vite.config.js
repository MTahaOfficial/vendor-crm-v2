import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev`: the web app runs on :5173 and forwards /api to the Node server on :4100.
export default defineConfig({
  plugins: [react()],
  server: { host: true, proxy: { '/api': { target: 'http://localhost:4100', changeOrigin: true } } },
});
