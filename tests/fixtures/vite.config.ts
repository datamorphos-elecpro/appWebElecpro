import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [react()], resolve: { alias: { 'next/image': fileURLToPath(new URL('./next-image.tsx', import.meta.url)) } }, server: { host: '127.0.0.1', port: 3100, strictPort: true } });
