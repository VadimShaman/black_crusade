// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/black_crusade/',
    // Дополнительно можно указать папку для сборки, если нужно:
    build: {
        outDir: 'dist',
    }
});