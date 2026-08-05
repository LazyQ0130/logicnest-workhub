const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const AuditSeverity = {
  High: 'high',
  Critical: 'critical',
};

// npm publishes its CLI with a locked bundleDependencies tree. Remove each
// exception as soon as npm publishes a bundle containing the patched version.
// Exact npm/dependency versions, nodes, and GHSA IDs keep this fail-closed.
const TemporaryAuditException = {
  'brace-expansion': {
    node: 'node_modules/npm/node_modules/brace-expansion',
    lockedVersion: '5.0.7',
    advisories: new Set([
      'GHSA-mh99-v99m-4gvg',
      'GHSA-rgw5-rvv9-x895',
    ]),
  },
  'ip-address': {
    node: 'node_modules/npm/node_modules/ip-address',
    lockedVersion: '10.2.0',
    advisories: new Set([
      'GHSA-mwp4-54f8-5fhr',
      'GHSA-4xrf-jv44-h6hh',
      'GHSA-22jq-vg5j-6vgg',
    ]),
  },
};

const EXPECTED_BUNDLED_NPM_VERSION = '11.19.0';

function advisoryId(via) {
  if (!via || typeof via !== 'object' || typeof via.url !== 'string') return null;
  return via.url.match(/GHSA-[a-z0-9-]+/i)?.[0] ?? null;
}

function evaluateAuditReport(report, lockfile) {
  const blocking = [];
  const accepted = [];
  const vulnerabilities = report?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') {
    return { blocking: [{ name: 'audit-report', reason: 'npm audit returned no vulnerability map' }], accepted };
  }

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (vulnerability?.severity !== AuditSeverity.High && vulnerability?.severity !== AuditSeverity.Critical) continue;
    const exception = TemporaryAuditException[name];
    const rejectionReason = exceptionRejectionReason(vulnerability, exception, lockfile);
    if (rejectionReason) blocking.push({ name, reason: rejectionReason });
    else accepted.push({ name, node: exception.node, advisories: [...exception.advisories] });
  }

  return { blocking, accepted };
}

function exceptionRejectionReason(vulnerability, exception, lockfile) {
  if (!exception) return 'no temporary exception is defined';
  const npmEntry = lockfile?.packages?.['node_modules/npm'];
  if (npmEntry?.version !== EXPECTED_BUNDLED_NPM_VERSION) {
    return `temporary exception only applies to bundled npm ${EXPECTED_BUNDLED_NPM_VERSION}`;
  }
  const dependencyEntry = lockfile?.packages?.[exception.node];
  if (dependencyEntry?.version !== exception.lockedVersion || dependencyEntry?.inBundle !== true) {
    return `expected bundled ${exception.node}@${exception.lockedVersion}`;
  }
  if (!Array.isArray(vulnerability.nodes)
    || vulnerability.nodes.length !== 1
    || vulnerability.nodes[0] !== exception.node) {
    return `vulnerability is not confined to ${exception.node}`;
  }
  if (!Array.isArray(vulnerability.via) || vulnerability.via.length === 0) {
    return 'vulnerability has no advisory details';
  }
  const reportedAdvisories = vulnerability.via.map(advisoryId);
  if (reportedAdvisories.some(id => !id || !exception.advisories.has(id))) {
    return 'vulnerability includes an advisory that has not been reviewed';
  }
  if ([...exception.advisories].some(id => !reportedAdvisories.includes(id))) {
    return 'temporary exception no longer matches the reviewed advisory set';
  }
  return null;
}

function run() {
  const auditCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const auditArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm audit --json']
    : ['audit', '--json'];
  const audit = spawnSync(auditCommand, auditArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (audit.error) throw audit.error;
  if (audit.status !== 0 && audit.status !== 1) {
    process.stderr.write(audit.stderr || `npm audit exited with status ${audit.status}\n`);
    process.exit(audit.status ?? 1);
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    process.stderr.write('npm audit did not return valid JSON.\n');
    process.stderr.write(audit.stderr || audit.stdout);
    process.exit(1);
  }
  const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const result = evaluateAuditReport(report, lockfile);
  for (const item of result.accepted) {
    process.stdout.write(`Temporarily accepted ${item.name} at ${item.node}: ${item.advisories.join(', ')}\n`);
  }
  if (result.blocking.length > 0) {
    for (const item of result.blocking) {
      process.stderr.write(`Blocking ${item.name}: ${item.reason}\n`);
    }
    process.exit(1);
  }
  process.stdout.write('Root dependency audit passed at the high severity threshold.\n');
}

if (require.main === module) run();

module.exports = {
  evaluateAuditReport,
};
