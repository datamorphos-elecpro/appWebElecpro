import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [react()], resolve: { alias: [
  { find: 'next/image', replacement: fileURLToPath(new URL('./next-image.tsx', import.meta.url)) },
  { find: 'next/link', replacement: fileURLToPath(new URL('./next-link.tsx', import.meta.url)) },
  { find: 'next/navigation', replacement: fileURLToPath(new URL('./next-navigation.tsx', import.meta.url)) },
  { find: /.*lib\/(data|analytics-queries|auth)$/, replacement: fileURLToPath(new URL('./coverage-data.ts', import.meta.url)) },
  { find: /.*app\/actions\/(quotes|business)$/, replacement: fileURLToPath(new URL('./quote-actions.ts', import.meta.url)) },
  { find: /.*app\/actions\/(projects|withholdings)$/, replacement: fileURLToPath(new URL('./project-actions.ts', import.meta.url)) },
  { find: /.*app\/actions\/project-files$/, replacement: fileURLToPath(new URL('./project-file-actions.ts', import.meta.url)) },
  { find: /.*lib\/project-file-upload$/, replacement: fileURLToPath(new URL('./project-file-upload.ts', import.meta.url)) },
  { find: /.*supabase\/client$/, replacement: fileURLToPath(new URL('./supabase-client.ts', import.meta.url)) },
] }, server: { host: '127.0.0.1', port: 3100, strictPort: true } });
