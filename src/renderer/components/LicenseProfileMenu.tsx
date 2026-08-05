import {
  ArrowRightStartOnRectangleIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import type { LicenseState } from '@shared/license';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { i18nService } from '../services/i18n';
import { formatLicenseExpiry } from '../services/licenseAccountPresentation';
import {
  createDefaultUserPersonalization,
  resolvePersonalizationAvatarUrl,
  resolvePersonalizationDisplayName,
  UserPersonalizationEvent,
  userPersonalizationService,
  type UserPersonalizationV1,
} from '../services/userPersonalization';

interface LicenseProfileMenuProps {
  licenseState: LicenseState;
  onShowSettings: () => void;
  onLogout: () => Promise<void>;
}

const LicenseProfileMenu: React.FC<LicenseProfileMenuProps> = ({
  licenseState,
  onShowSettings,
  onLogout,
}) => {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [personalization, setPersonalization] = useState<UserPersonalizationV1>(
    createDefaultUserPersonalization,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const userId = licenseState.user?.uid ?? '';

  useEffect(() => {
    let active = true;
    setPersonalization(createDefaultUserPersonalization());
    void userPersonalizationService.get(userId).then((value) => {
      if (active) setPersonalization(value);
    });
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        userId: string;
        personalization: UserPersonalizationV1;
      }>).detail;
      if (detail?.userId === userId) setPersonalization(detail.personalization);
    };
    window.addEventListener(UserPersonalizationEvent.Updated, handleUpdated);
    return () => {
      active = false;
      window.removeEventListener(UserPersonalizationEvent.Updated, handleUpdated);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const avatarUrl = resolvePersonalizationAvatarUrl(personalization.avatar);
  const language = i18nService.getLanguage();
  const displayName = resolvePersonalizationDisplayName(
    personalization,
    licenseState.user?.phoneMasked,
    i18nService.t('accountDefaultName'),
  );
  const expiry = useMemo(
    () => formatLicenseExpiry(
      licenseState.membership.expiresAt,
      nowMs,
      language,
    ),
    [language, licenseState.membership.expiresAt, nowMs],
  );

  const handleLogout = async (): Promise<void> => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await onLogout();
      setOpen(false);
    } catch {
      setLogoutError(i18nService.t('accountLogoutFailed'));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setLogoutError(null);
          setOpen((current) => !current);
        }}
        className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserCircleIcon className="h-5 w-5 text-secondary" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayName}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-popover popover-enter"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserCircleIcon className="h-7 w-7 text-secondary" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
              {personalization.signature && (
                <span className="mt-0.5 block truncate text-xs text-secondary">
                  {personalization.signature}
                </span>
              )}
            </span>
          </div>

          <div className="border-b border-border px-3 py-3">
            <div className="rounded-xl bg-surface-raised px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                <CalendarDaysIcon className="mt-0.5 h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
                <div className="min-w-0 text-xs">
                  <div className="font-medium text-foreground">
                    {expiry.status === 'active'
                      ? `${i18nService.t('accountLicenseRemaining')} ${expiry.remaining}`
                      : expiry.status === 'expired'
                        ? i18nService.t('accountLicenseExpired')
                        : i18nService.t('accountLicenseExpiryUnknown')}
                  </div>
                  {expiry.expiresAt && (
                    <div className="mt-1 break-words text-secondary">
                      {i18nService.t('accountLicenseExpiresAt')} {expiry.expiresAt}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {logoutError && (
            <p role="alert" className="border-b border-border px-4 py-2 text-xs text-red-600 dark:text-red-400">
              {logoutError}
            </p>
          )}

          <div className="py-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onShowSettings();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-raised"
            >
              <Cog6ToothIcon className="h-4 w-4" aria-hidden="true" />
              <span>{i18nService.t('settings')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={() => { void handleLogout(); }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
            >
              <ArrowRightStartOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
              <span>
                {loggingOut ? i18nService.t('accountLoggingOut') : i18nService.t('logicnestLicenseLogout')}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LicenseProfileMenu;
