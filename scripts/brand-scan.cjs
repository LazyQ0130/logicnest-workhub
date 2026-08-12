const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const roots = ['src', 'services', 'scripts'];
const extensions = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.html', '.nsh', '.ps1']);
const skippedDirs = new Set(['node_modules', 'dist', 'dist-electron', 'coverage']);
const forbidden = [
  { label: 'upstream Youdao domain', pattern: /(?:https?:\/\/[^\s'"`]*youdao|\.youdao\.com)/i },
  { label: 'upstream hosted mail gateway', pattern: /claw\.163\.com/i },
  { label: 'upstream telemetry endpoint', pattern: /rlogs?\.youdao|api-overmind/i },
  { label: 'upstream hardware CDN', pattern: /ydhardware(?:business|common)\.nosdn\.127\.net/i },
  { label: 'Windows Defender exclusion', pattern: /(?:Add|Set)-MpPreference/i },
];
const approvedPinnedHardwareReferences = new Map([
  [
    'src/main/computerUse/computerUseRuntime.ts',
    "DownloadUrl: 'https://ydhardwarebusiness.nosdn.127.net/806b908f1ba20905cc5c99495bccc69c.zip',",
  ],
  [
    'src/shared/computerUse/constants.ts',
    "BuiltIn: 'https://ydhardwarebusiness.nosdn.127.net/2fa564627a3f1a0f3acedbc771d15f12.zip',",
  ],
]);
const ordinaryUiRoots = [
  'src/renderer/components/',
  'src/renderer/services/i18n.ts',
  'services/admin-web/src/',
];
const ordinaryUiForbidden = [
  { label: 'upstream product name', pattern: /(^|[^A-Za-z0-9_])LobsterAI([^A-Za-z0-9_]|$)/ },
  { label: 'upstream company product name', pattern: /网易有道/ },
  { label: 'upstream browser name', pattern: /有道龙虾/ },
  { label: 'legacy expert kit name', pattern: /专家套件/ },
  { label: 'legacy email name', pattern: /龙虾邮箱/ },
  { label: 'legacy messaging brand', pattern: /(^|[^A-Za-z0-9_])POPO([^A-Za-z0-9_]|$)/ },
  { label: 'upstream marketing phrase', pattern: /全场景办公/ },
  { label: 'legacy assistant term', pattern: /新建\s*Agent/i },
  { label: 'legacy assistant UI term', pattern: /(?:选择|当前|创建|我的|删除|编辑|自定义)\s*Agent/i },
  { label: 'legacy messaging term', pattern: /IM\s*机器人/i },
  { label: 'legacy operations name', pattern: /运营管理后台|运营控制台|逻栖工枢管理后台/ },
  { label: 'unsupported security status', pattern: /安全防护中/ },
  { label: 'unconfirmed support email', pattern: /support@logicnest\.workhub/i },
];
const stringLiteralPattern = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

function walk(directory, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirs.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (extensions.has(path.extname(entry.name))) files.push(absolute);
  }
}

const files = [];
for (const item of roots) {
  const absolute = path.join(root, item);
  if (fs.existsSync(absolute)) walk(absolute, files);
}
for (const item of ['electron-builder.json', 'package.json']) {
  files.push(path.join(root, item));
}

const findings = [];
for (const file of files) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (relative === 'scripts/brand-scan.cjs') continue;
  if (/\.(?:test|spec)\.[^.]+$/.test(relative)) continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of forbidden) {
      const approvedPinnedReference = rule.label === 'upstream hardware CDN'
        && approvedPinnedHardwareReferences.get(relative) === line.trim();
      const preservedUpstreamLicenseReference = rule.label === 'upstream Youdao domain'
        && relative === 'services/license-server/prisma/catalogSeed.ts'
        && line.includes('github.com/netease-youdao/LobsterAI');
      if (rule.pattern.test(line) && !approvedPinnedReference && !preservedUpstreamLicenseReference) {
        findings.push(`${relative}:${index + 1}: ${rule.label}`);
      }
    }
    const isOrdinaryUiFile = ordinaryUiRoots.some((uiRoot) => relative.startsWith(uiRoot));
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('*');
    const isPreservedLegalName = relative === 'src/renderer/services/i18n.ts'
      && /(?:网易有道LobsterAI|NetEase Youdao LobsterAI)/.test(line);
    if (!isOrdinaryUiFile || isComment || isPreservedLegalName) return;

    stringLiteralPattern.lastIndex = 0;
    for (const match of line.matchAll(stringLiteralPattern)) {
      const literal = match[1] ?? match[2] ?? match[3] ?? '';
      for (const rule of ordinaryUiForbidden) {
        if (rule.pattern.test(literal)) {
          findings.push(`${relative}:${index + 1}: ordinary UI ${rule.label}`);
        }
      }
    }
  });
}

if (findings.length > 0) {
  console.error('[brand-scan] blocked references found:');
  findings.forEach(finding => console.error(`  ${finding}`));
  process.exitCode = 1;
} else {
  console.log(`[brand-scan] passed (${files.length} files checked)`);
}
