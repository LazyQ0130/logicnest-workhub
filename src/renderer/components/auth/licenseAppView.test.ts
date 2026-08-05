import { describe, expect, test } from 'vitest';

import { LicensePhase } from '../../../shared/license';
import { LicenseAppView, resolveLicenseAppView } from './licenseAppView';

describe('resolveLicenseAppView', () => {
  test('routes signed-out users to registration and login', () => {
    expect(resolveLicenseAppView({
      baseInitialized: true,
      coreInitialized: false,
      licensePhase: LicensePhase.SignedOut,
    })).toBe(LicenseAppView.SignedOut);
  });

  test('routes signed-in users without membership to the locked shell', () => {
    expect(resolveLicenseAppView({
      baseInitialized: true,
      coreInitialized: false,
      licensePhase: LicensePhase.ActivationRequired,
    })).toBe(LicenseAppView.ActivationRequired);
  });

  test('keeps an authorized user on the restart transition until core initialization finishes', () => {
    expect(resolveLicenseAppView({
      baseInitialized: true,
      coreInitialized: false,
      licensePhase: LicensePhase.Authorized,
    })).toBe(LicenseAppView.WorkspaceStarting);
  });

  test('renders the complete shell only after authorization and core initialization', () => {
    expect(resolveLicenseAppView({
      baseInitialized: true,
      coreInitialized: true,
      licensePhase: LicensePhase.Authorized,
    })).toBe(LicenseAppView.Authorized);
  });

  test('routes restricted users to the restricted page', () => {
    expect(resolveLicenseAppView({
      baseInitialized: true,
      coreInitialized: false,
      licensePhase: LicensePhase.Restricted,
    })).toBe(LicenseAppView.Restricted);
  });
});
