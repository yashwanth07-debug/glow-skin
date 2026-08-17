import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deploy base path:
//   GitHub Pages → VITE_BASE_PATH=/glow-skin/ (set in .github/workflows/pages.yml)
//   Render/Vercel → defaults to '/' (site served at domain root)
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  plugins: [react()],
  base,
  server: { port: 5373, host: '0.0.0.0', allowedHosts: true },
  test: { include: ['src/**/*.test.ts'] },
});
