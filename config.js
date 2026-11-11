// Public config only. No secrets here. Set to your deployed Worker URL.
// On localhost the page talks to the local Worker (`wrangler dev`, port 8787).
window.IM_API = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8787'
  : 'https://internmatch-api.entrace-space.workers.dev';
