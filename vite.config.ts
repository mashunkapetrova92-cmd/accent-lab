import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the app run from any folder, for example https://name.github.io/accent-lab/
export default defineConfig({
  base: './',
  plugins: [react()],
  // shown in Settings, so it is easy to tell which version an installed app is running
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  // the speech-recognition worker imports Transformers.js, which needs an ES module worker
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
