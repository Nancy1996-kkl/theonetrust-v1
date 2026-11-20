// Vercel function for every /api request (Phase 2a). The API is bundled into
// apps/api/dist/serverless.mjs by `pnpm --filter @theonetrust/api build:serverless`.
export { default } from '../apps/api/dist/serverless.mjs';
export const config = { maxDuration: 30 };
