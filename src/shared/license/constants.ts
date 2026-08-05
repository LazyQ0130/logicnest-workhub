export const LicenseIpcChannel = {
  GetState: 'license:get-state',
  Register: 'license:register',
  Login: 'license:login',
  Redeem: 'license:redeem',
  Logout: 'license:logout',
  Refresh: 'license:refresh',
  Heartbeat: 'license:heartbeat',
  StateChanged: 'license:state-changed',
} as const;

export type LicenseIpcChannel = typeof LicenseIpcChannel[keyof typeof LicenseIpcChannel];

export const LicensePhase = {
  Loading: 'loading',
  SignedOut: 'signed_out',
  ActivationRequired: 'activation_required',
  Authorized: 'authorized',
  OfflineGrace: 'offline_grace',
  Restricted: 'restricted',
} as const;

export type LicensePhase = typeof LicensePhase[keyof typeof LicensePhase];

export interface LicenseUser {
  uid: string;
  phoneMasked: string;
  status: 'active' | 'suspended';
}

export interface LicenseMembership {
  status: 'none' | 'active' | 'expired' | 'revoked';
  planCode?: string;
  expiresAt?: string;
  entitlementVersion?: number;
}

export interface LicenseDevice {
  status: 'active' | 'suspended' | 'unbound';
  lastOnlineAt?: string;
  clientVersion?: string;
}

export interface LicenseState {
  phase: LicensePhase;
  user: LicenseUser | null;
  membership: LicenseMembership;
  device: LicenseDevice | null;
  offlineUntil: string | null;
  lastServerTime: string | null;
  heartbeatAfterSeconds: number;
  messageCode?: string;
  message?: string;
}

export interface LicenseCredentials {
  phone: string;
  password: string;
}

export interface LicenseRegistration extends LicenseCredentials {
  passwordConfirmation: string;
}

export interface LicenseActionResult {
  state: LicenseState;
  requiresRestart?: boolean;
}

export interface LicenseActionError {
  error: LicenseApiErrorShape;
}

export type LicenseActionResponse = LicenseActionResult | LicenseActionError;

export interface LicenseApiErrorShape {
  code: string;
  message: string;
  requestId?: string;
}
