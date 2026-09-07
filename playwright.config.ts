import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: '**/*.spec.ts', workers: 1, reporter: 'list', expect: {timeout: 15000}, use: {actionTimeout: 15000} });
