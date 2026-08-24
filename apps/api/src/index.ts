import { createApp } from './app';

const port = Number(process.env.API_PORT ?? 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`[vibe-api] listening on http://localhost:${port}`);
});
