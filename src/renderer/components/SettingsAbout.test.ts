import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { BRAND } from '../../shared/brand';

const settingsSource = fs.readFileSync(path.resolve(__dirname, 'Settings.tsx'), 'utf8');
const appearanceSettingsSource = fs.readFileSync(
  path.resolve(__dirname, 'settings/AppearanceSettings.tsx'),
  'utf8',
);

describe('Settings about page branding', () => {
  test('does not expose an unconfirmed contact address', () => {
    expect(BRAND.contact.email).toBeNull();
    expect(settingsSource).not.toContain('support@logicnest.workhub');
  });

  test('uses customer-facing documentation names from the brand config', () => {
    expect(BRAND.documents.userGuide.labelZh).toBe('使用与激活指南');
    expect(BRAND.documents.security.labelZh).toBe('安全审计说明');
    expect(settingsSource).toContain("i18nService.t('aboutViewDocument')");
    expect(settingsSource).not.toContain("const ABOUT_USER_MANUAL_LABEL = 'client-activation.md'");
  });

  test('does not present the security audit as terms of service', () => {
    expect(BRAND.documents.serviceTerms).toBeNull();
    expect(settingsSource).toContain('handleOpenSecurityNotes');
    expect(settingsSource).not.toContain('handleOpenServiceTerms');
    expect(settingsSource).not.toContain("i18nService.t('aboutServiceTerms')");
  });

  test('exposes all built-in themes approved by the brand', () => {
    expect(BRAND.appearance.visibleThemeIds).toEqual([
      'classic-light',
      'classic-dark',
      'dawn',
      'daylight',
      'paper',
      'sakura',
      'midnight',
      'ocean',
      'emerald',
      'rose',
      'mocha',
      'sunset',
      'nord',
      'cyber',
    ]);
    expect(appearanceSettingsSource).toContain(
      'BRAND.appearance.visibleThemeIds.includes(themeDefinition.meta.id)',
    );
  });
});
