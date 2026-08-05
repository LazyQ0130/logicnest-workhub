const baseUrl = (process.argv[2] || process.env.ADMIN_WEB_URL || 'http://127.0.0.1:4175')
  .replace(/\/+$/, '');

const expectedTitle = '<title>逻栖工枢 · 运营中心</title>';
const expectedCopy = [
  '运营中心登录',
  '登录运营中心',
  '关键操作将记录审计日志',
];

const readText = async (url) => {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
};

const html = await readText(`${baseUrl}/`);
if (!html.includes(expectedTitle)) {
  throw new Error('deployed page title does not match the current operations-center build');
}

const assetPaths = Array.from(html.matchAll(/(?:src|href)="([^"]+\.js)"/g), (match) => match[1]);
if (assetPaths.length === 0) throw new Error('deployed page contains no JavaScript assets');
const bundles = await Promise.all(assetPaths.map((assetPath) => readText(new URL(assetPath, `${baseUrl}/`).href)));
const source = bundles.join('\n');
for (const phrase of expectedCopy) {
  if (!source.includes(phrase)) {
    throw new Error('deployed JavaScript is missing required operations-center copy');
  }
}

const healthResponse = await fetch(`${baseUrl}/healthz`, { redirect: 'error' });
if (!healthResponse.ok || (await healthResponse.text()).trim() !== 'ok') {
  throw new Error('deployed health endpoint is not ready');
}

console.log('[admin-web] production deployment verification passed');
