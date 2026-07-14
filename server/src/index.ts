import { config } from './config.ts';
import { createDb, bootstrapSuperAdmin } from './db.ts';
import { createApp } from './app.ts';

const db = createDb();
await bootstrapSuperAdmin(db);
const app = createApp(db);

console.log(`permish-server (bun+hono) listening on http://localhost:${config.port}`);

export default {
  port: config.port,
  // Pass the socket address through as the Hono env so rate limiting can key
  // on it instead of trusting spoofable X-Forwarded-For headers.
  fetch: (req: Request, server: { requestIP(req: Request): { address: string } | null }) =>
    app.fetch(req, { ip: server.requestIP(req)?.address ?? null }),
};
