import { defineConfig } from 'vite';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isProjectPages = Boolean(repositoryName) && !repositoryName.endsWith('.github.io');

export default defineConfig({
  base: process.env.VITE_BASE_PATH
    ?? (process.env.GITHUB_ACTIONS && isProjectPages ? `/${repositoryName}/` : '/'),
});
