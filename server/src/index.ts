import { config } from './config.ts';
import { createDb, bootstrapSuperAdmin } from './db.ts';
import { createApp } from './app.ts';

const db = createDb();
await bootstrapSuperAdmin(db);
const app = createApp(db);

console.log(`permish-server (bun+hono) listening on http://localhost:${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
