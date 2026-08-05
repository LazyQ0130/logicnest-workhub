import { LicensePhase, type LicenseState } from '../../../shared/license';

export const LicenseAppView = {
  Loading: 'loading',
  SignedOut: 'signed_out',
  ActivationRequired: 'activation_required',
  WorkspaceStarting: 'workspace_starting',
  Authorized: 'authorized',
  Restricted: 'restricted',
  InitializationError: 'initialization_error',
} as const;

export type LicenseAppView = typeof LicenseAppView[keyof typeof LicenseAppView];

export interface ResolveLicenseAppViewInput {
  baseInitialized: boolean;
  coreInitialized: boolean;
  licensePhase: LicenseState['phase'];
  hasInitializationError?: boolean;
}

export function resolveLicenseAppView({
  baseInitialized,
  coreInitialized,
  licensePhase,
  hasInitializationError = false,
}: ResolveLicenseAppViewInput): LicenseAppView {
  if (!baseInitialized || licensePhase === LicensePhase.Loading) {
    return LicenseAppView.Loading;
  }
  if (hasInitializationError) {
    return LicenseAppView.InitializationError;
  }

  switch (licensePhase) {
    case LicensePhase.SignedOut:
      return LicenseAppView.SignedOut;
    case LicensePhase.ActivationRequired:
      return LicenseAppView.ActivationRequired;
    case LicensePhase.Restricted:
      return LicenseAppView.Restricted;
    case LicensePhase.Authorized:
    case LicensePhase.OfflineGrace:
      return coreInitialized
        ? LicenseAppView.Authorized
        : LicenseAppView.WorkspaceStarting;
    default:
      return LicenseAppView.Loading;
  }
}
