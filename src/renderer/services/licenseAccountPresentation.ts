export interface LicenseExpiryPresentation {
  status: 'active' | 'expired' | 'unknown';
  remaining: string | null;
  expiresAt: string | null;
}

const MINUTE_MS = 60_000;

export const formatLicenseExpiry = (
  expiresAt: string | undefined,
  nowMs: number,
  language: 'zh' | 'en',
): LicenseExpiryPresentation => {
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAtMs)) {
    return { status: 'unknown', remaining: null, expiresAt: null };
  }

  const exact = new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(expiresAtMs));
  const difference = expiresAtMs - nowMs;
  if (difference <= 0) {
    return { status: 'expired', remaining: null, expiresAt: exact };
  }

  const totalMinutes = Math.max(1, Math.ceil(difference / MINUTE_MS));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  let remaining: string;
  if (days > 0) {
    remaining = language === 'zh'
      ? `${days}天${hours > 0 ? ` ${hours}小时` : ''}`
      : `${days}d${hours > 0 ? ` ${hours}h` : ''}`;
  } else if (hours > 0) {
    remaining = language === 'zh'
      ? `${hours}小时${minutes > 0 ? ` ${minutes}分钟` : ''}`
      : `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  } else {
    remaining = language === 'zh' ? `${minutes}分钟` : `${minutes}m`;
  }
  return { status: 'active', remaining, expiresAt: exact };
};
