import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkDocumentFlow } from './document-flow.mjs';

if (!process.env.INTERNMATCH_PLAYWRIGHT_MODULE) throw Error('Set the installed Playwright module path');
const pw = await import(pathToFileURL(process.env.INTERNMATCH_PLAYWRIGHT_MODULE));
const base = 'http://localhost:8787', outputDir = resolve('output/playwright/documents');
mkdirSync(outputDir, { recursive: true });
for (const engine of ['chromium', 'webkit']) {
  const browser = await pw[engine].launch({ headless: true });
  try {
    const context = await browser.newContext(engine === 'webkit' ? { ...pw.devices['iPhone 13'] } : { viewport: { width: 1280, height: 900 } });
    await context.request.get(base + '/__uat/login?account=a');
    const result = await checkDocumentFlow(await context.newPage(), { base, label: engine, outputDir });
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
