import { classifyErrorKey } from '../../common/coworkErrorClassify';
import { classifyUserFacingErrorKey, rawErrorText } from '../../common/userFacingError';
import { i18nService } from './i18n';

export interface UserFacingErrorOptions {
  fallbackKey?: string;
}

const LICENSE_ERROR_KEYS: Record<string, string> = {
  INVALID_PHONE: 'logicnestLicenseInvalidPhone',
  INVALID_PASSWORD: 'logicnestLicenseInvalidPassword',
  PASSWORD_MISMATCH: 'logicnestLicensePasswordMismatch',
  PHONE_ALREADY_REGISTERED: 'logicnestLicensePhoneAlreadyRegistered',
  INVALID_CREDENTIALS: 'logicnestLicenseInvalidCredentials',
  DEVICE_NOT_BOUND: 'logicnestLicenseDeviceUnavailable',
  DEVICE_SUSPENDED: 'logicnestLicenseDeviceUnavailable',
  USER_SUSPENDED: 'logicnestLicenseAccountSuspended',
  LICENSE_REQUEST_TIMEOUT: 'userErrorTimeout',
  LICENSE_CERTIFICATE_ERROR: 'userErrorCertificate',
  LICENSE_NETWORK_ERROR: 'userErrorNetwork',
  RATE_LIMITED: 'userErrorRateLimit',
};

export function formatUserFacingError(
  error: unknown,
  options: UserFacingErrorOptions = {},
): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const licenseErrorKey = LICENSE_ERROR_KEYS[code];
  if (licenseErrorKey) return i18nService.t(licenseErrorKey);

  const raw = rawErrorText(error);
  // Preserve actionable provider details during connector authorization.
  if (/企查查授权|Qichacha authorization|Qichacha OAuth/i.test(raw)) return raw;
  const key = raw ? classifyUserFacingErrorKey(raw) ?? classifyErrorKey(raw) : null;
  if (key) return i18nService.t(key);

  const fallback = i18nService.t(options.fallbackKey ?? 'userErrorUnknown');
  if (i18nService.getLanguage() === 'zh') return fallback;
  return raw || fallback;
}
