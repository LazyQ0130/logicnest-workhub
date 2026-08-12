import { createRequire } from 'node:module';

import { describe, expect, test } from 'vitest';

interface AuditResult {
  accepted: Array<{ name: string }>;
  blocking: Array<{ name: string; reason: string }>;
}

interface AuditModule {
  evaluateAuditReport: (report: unknown, lockfile: unknown) => AuditResult;
}

const require = createRequire(import.meta.url);
const { evaluateAuditReport } = require('../scripts/run-root-dependency-audit.cjs') as AuditModule;

const reviewedReport = {
  vulnerabilities: {
    'brace-expansion': {
      severity: 'high',
      nodes: ['node_modules/npm/node_modules/brace-expansion'],
      via: [
        { url: 'https://github.com/advisories/GHSA-mh99-v99m-4gvg' },
        { url: 'https://github.com/advisories/GHSA-rgw5-rvv9-x895' },
      ],
    },
    'ip-address': {
      severity: 'high',
      nodes: ['node_modules/npm/node_modules/ip-address'],
      via: [
        { url: 'https://github.com/advisories/GHSA-mwp4-54f8-5fhr' },
        { url: 'https://github.com/advisories/GHSA-4xrf-jv44-h6hh' },
        { url: 'https://github.com/advisories/GHSA-22jq-vg5j-6vgg' },
      ],
    },
    moderateOnly: {
      severity: 'moderate',
      nodes: ['node_modules/moderate-only'],
      via: [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
    },
  },
};

const reviewedLockfile = {
  packages: {
    'node_modules/npm': { version: '11.19.0' },
    'node_modules/npm/node_modules/brace-expansion': { version: '5.0.7', inBundle: true },
    'node_modules/npm/node_modules/ip-address': { version: '10.2.0', inBundle: true },
  },
};

describe('root dependency audit policy', () => {
  test('accepts only the reviewed advisories in the pinned bundled npm tree', () => {
    const result = evaluateAuditReport(reviewedReport, reviewedLockfile);

    expect(result.blocking).toEqual([]);
    expect(result.accepted.map(item => item.name)).toEqual(['brace-expansion', 'ip-address']);
  });

  test('blocks a newly reported advisory for an excepted package', () => {
    const report = structuredClone(reviewedReport);
    report.vulnerabilities['brace-expansion'].via.push({
      url: 'https://github.com/advisories/GHSA-new1-new2-new3',
    });

    const result = evaluateAuditReport(report, reviewedLockfile);

    expect(result.blocking).toContainEqual({
      name: 'brace-expansion',
      reason: 'vulnerability includes an advisory that has not been reviewed',
    });
  });

  test('blocks every unrelated high or critical vulnerability', () => {
    const report = structuredClone(reviewedReport) as {
      vulnerabilities: Record<string, {
        severity: string;
        nodes: string[];
        via: Array<{ url: string }>;
      }>;
    };
    report.vulnerabilities.unreviewed = {
      severity: 'critical',
      nodes: ['node_modules/unreviewed'],
      via: [{ url: 'https://github.com/advisories/GHSA-new1-new2-new3' }],
    };

    const result = evaluateAuditReport(report, reviewedLockfile);

    expect(result.blocking).toContainEqual({
      name: 'unreviewed',
      reason: 'no temporary exception is defined',
    });
  });

  test('blocks the exception when the npm bundle version changes', () => {
    const lockfile = structuredClone(reviewedLockfile);
    lockfile.packages['node_modules/npm'].version = '12.0.0';

    const result = evaluateAuditReport(reviewedReport, lockfile);

    expect(result.blocking).toHaveLength(2);
    expect(result.blocking[0]?.reason).toContain('only applies to bundled npm 11.19.0');
  });
});
