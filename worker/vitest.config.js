import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, WEB_ORIGIN: 'https://x.test', ALLOWED_EMAILS: 'Ton@Example.com,in@example.com', BREVO_API_KEY: 'test-key', BREVO_SENDER_EMAIL: 'sender@example.com', LINE_CHANNEL_SECRET: 'line-secret', LINE_CHANNEL_ACCESS_TOKEN: 'line-token' } },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.js'] },
  };
});
