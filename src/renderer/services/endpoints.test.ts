import { afterEach, expect, test, vi } from 'vitest';

import { configService } from './config';
import {
  getPortalCreditsResetActivityUrl,
  getPortalInvitationUrl,
  getPortalPricingUrl,
  getPortalProfileUrl,
  getPortalRechargeUrl,
  PortalPricingKeyfrom,
} from './endpoints';

const mockTestMode = (testMode: boolean) => {
  vi.spyOn(configService, 'getConfig').mockReturnValue({
    app: { testMode },
  } as ReturnType<typeof configService.getConfig>);
};

afterEach(() => {
  vi.restoreAllMocks();
});

test('legacy portal account urls remain locally closed in production mode', () => {
  mockTestMode(false);

  expect(getPortalProfileUrl()).toBe('http://127.0.0.1:1/profile');
  expect(getPortalRechargeUrl()).toBe('http://127.0.0.1:1/');
  expect(getPortalInvitationUrl()).toBe('http://127.0.0.1:1/invitation');
  expect(getPortalCreditsResetActivityUrl()).toBe('http://127.0.0.1:1/profile?activity=credits_reset');
  expect(getPortalCreditsResetActivityUrl('credits_final_reward_2026_07')).toBe(
    'http://127.0.0.1:1/profile?activity=credits_reset&campaignCode=credits_final_reward_2026_07',
  );
});

test('legacy portal account urls remain locally closed in test mode', () => {
  mockTestMode(true);

  expect(getPortalProfileUrl()).toBe('http://127.0.0.1:1/profile');
  expect(getPortalRechargeUrl()).toBe('http://127.0.0.1:1/');
  expect(getPortalInvitationUrl()).toBe('http://127.0.0.1:1/invitation');
  expect(getPortalCreditsResetActivityUrl()).toBe('http://127.0.0.1:1/profile?activity=credits_reset');
});

test('portal pricing url can include html share keyfrom', () => {
  mockTestMode(false);

  expect(getPortalPricingUrl(PortalPricingKeyfrom.HtmlShare)).toBe(
    'http://127.0.0.1:1/pricing?keyfrom=html_share',
  );
});
