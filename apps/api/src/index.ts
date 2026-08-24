import { createApp } from './app';

const port = Number(process.env.API_PORT ?? 3001);
const app = createApp();

// DEPLOYMENT.md：API 只绑 127.0.0.1（nginx 反代对外），不暴露到公网
app.listen(port, '127.0.0.1', () => {
  console.log(`[vibe-api] listening on http://127.0.0.1:${port}`);
});
