/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 編集画面（index.html）と閲覧ページ（v/index.html）を別の入口に分ける。
// 閲覧ページは受け取る人が LINE から開くので、編集画面のコードを一切読み込まない。
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        view: resolve(import.meta.dirname, 'v/index.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
