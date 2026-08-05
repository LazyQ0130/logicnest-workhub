import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';

describe('LogicNestLicenseGate packaged assets', () => {
  test('uses a document-relative logo path for packaged file URLs', () => {
    const sourcePath = path.resolve(__dirname, 'LogicNestLicenseGate.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain('src="./logo.png"');
    expect(source).not.toContain('src="/logo.png"');
  });

  test('uses the neutral semantic theme instead of the retired technology-blue palette', () => {
    const sourcePath = path.resolve(__dirname, 'LogicNestLicenseGate.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain('bg-background');
    expect(source).toContain('bg-foreground');
    expect(source).not.toMatch(/#(?:07182E|0D2747|12D9F4|F2C14E)/i);
  });

  test('keeps Windows window controls available while the license gate is active', () => {
    const sourcePath = path.resolve(__dirname, 'LogicNestLicenseGate.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("import WindowTitleBar from '../window/WindowTitleBar';");
    expect(source).toContain('className="draggable absolute inset-x-0 top-0');
    expect(source).toContain('<WindowTitleBar />');
  });

  test('provides independent password visibility controls', () => {
    const sourcePath = path.resolve(__dirname, 'LogicNestLicenseGate.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';");
    expect(source).toContain("type={showPassword ? 'text' : 'password'}");
    expect(source).toContain("type={showPasswordConfirmation ? 'text' : 'password'}");
    expect(source).toContain("'logicnestLicenseShowPassword'");
    expect(source).toContain("'logicnestLicenseHidePassword'");
  });

  test('keeps +86 in a dedicated country-code selector instead of the phone field', () => {
    const sourcePath = path.resolve(__dirname, 'LogicNestLicenseGate.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("defaultValue={CHINA_CALLING_CODE}");
    expect(source).toContain("autoComplete=\"tel-national\"");
    expect(source).toContain("formatChinaMobileE164(phone)");
  });

  test('uses readable semantic colors for license errors in both themes', () => {
    const sourcePath = path.resolve(__dirname, 'LogicNestLicenseGate.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain('text-red-700');
    expect(source).toContain('dark:text-red-300');
    expect(source).not.toContain('text-red-100');
  });

  test('uses a static locked shell without mounting runtime views', () => {
    const sourcePath = path.resolve(__dirname, 'LogicNestLockedShell.tsx');
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("i18nService.t('logicnestLockedFeatureNotice')");
    expect(source).toContain("i18nService.t('logicnestWorkspaceStarting')");
    expect(source).not.toContain('<Sidebar');
    expect(source).not.toContain('<CoworkView');
    expect(source).not.toContain('scheduledTaskService');
    expect(source).not.toContain('coworkService');
  });
});
