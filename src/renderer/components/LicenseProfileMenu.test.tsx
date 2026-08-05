// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { LicensePhase, type LicenseState } from '../../shared/license';

const getPersonalization = vi.hoisted(() => vi.fn());

vi.mock('../services/i18n', () => ({
  i18nService: {
    getLanguage: () => 'zh',
    t: (key: string) => ({
      accountDefaultName: '我的账号',
      accountLicenseRemaining: '卡密剩余',
      accountLicenseExpiresAt: '到期时间：',
      accountLicenseExpired: '卡密已到期',
      accountLicenseExpiryUnknown: '未提供到期时间',
      accountLoggingOut: '正在退出…',
      accountLogoutFailed: '退出登录失败',
      logicnestLicenseLogout: '退出账号',
      settings: '设置',
    } as Record<string, string>)[key] ?? key,
  },
}));

vi.mock('../services/userPersonalization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/userPersonalization')>();
  return {
    ...actual,
    userPersonalizationService: { get: getPersonalization },
  };
});

import LicenseProfileMenu from './LicenseProfileMenu';

const licenseState: LicenseState = {
  phase: LicensePhase.Authorized,
  user: { uid: 'user-1', phoneMasked: '138****0000', status: 'active' },
  membership: { status: 'active', expiresAt: '2099-01-01T00:00:00.000Z' },
  device: null,
  offlineUntil: null,
  lastServerTime: null,
  heartbeatAfterSeconds: 300,
};

describe('LicenseProfileMenu', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onShowSettings = vi.fn();
  const onLogout = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    onShowSettings.mockClear();
    onLogout.mockClear();
    getPersonalization.mockResolvedValue({
      version: 1,
      displayName: 'Olivia Miller',
      signature: 'Stay curious',
      avatar: null,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <LicenseProfileMenu
          licenseState={licenseState}
          onShowSettings={onShowSettings}
          onLogout={onLogout}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('shows personalized identity, license expiry, settings, and logout only', async () => {
    const accountButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Olivia Miller'));
    expect(accountButton).toBeTruthy();
    act(() => accountButton?.click());

    const menu = container.querySelector('[role="menu"]');
    expect(menu?.classList.contains('w-full')).toBe(true);
    expect(menu?.classList.contains('w-[17rem]')).toBe(false);
    expect(container.textContent).toContain('Stay curious');
    expect(container.textContent).toContain('卡密剩余');
    expect(container.textContent).toContain('到期时间');
    expect(container.textContent).not.toContain('充值');
    expect(container.textContent).not.toContain('邀请');
    expect(container.textContent).not.toContain('剩余用量');

    const settingsButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '设置');
    act(() => settingsButton?.click());
    expect(onShowSettings).toHaveBeenCalledTimes(1);

    act(() => accountButton?.click());
    const logoutButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '退出账号');
    await act(async () => {
      logoutButton?.click();
    });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
