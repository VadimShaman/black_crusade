import { defineConfig } from 'vite';

export default defineConfig({
    base: '/black_crusade/',
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                battle: 'battle.html'
            }
        }
    }
});