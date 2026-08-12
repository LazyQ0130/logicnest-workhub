import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CircleStackIcon,
  CpuChipIcon,
  LockClosedIcon,
  PuzzlePieceIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import React, { useState } from 'react';

import type { LicenseActionResponse, LicenseState } from '../../../shared/license';
import { LicensePhase } from '../../../shared/license';
import { i18nService } from '../../services/i18n';
import { formatUserFacingError } from '../../services/userFacingError';
import WindowTitleBar from '../window/WindowTitleBar';

interface LicenseStateViewProps {
  state: LicenseState;
  onState: (state: LicenseState) => void;
}

const isActionError = (
  result: LicenseActionResponse,
): result is { error: { code: string; message: string } } => 'error' in result;

const LockedNavigationItem: React.FC<{
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  onLocked: () => void;
}> = ({ icon: Icon, label, onLocked }) => (
  <button
    type="button"
    aria-disabled="true"
    onClick={onLocked}
    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-secondary transition hover:bg-surface-raised hover:text-foreground"
  >
    <Icon className="h-5 w-5" />
    <span className="flex-1">{label}</span>
    <LockClosedIcon className="h-3.5 w-3.5 text-muted" />
  </button>
);

export const LogicNestLockedShell: React.FC<LicenseStateViewProps> = ({ state, onState }) => {
  const [activationCode, setActivationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const showLockedNotice = (): void => {
    setNotice(i18nService.t('logicnestLockedFeatureNotice'));
    setError(null);
  };

  const redeem = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.electron.license.redeem(activationCode.trim());
      if (isActionError(result)) {
        setError(formatUserFacingError(result.error, { fallbackKey: 'logicnestLicenseError' }));
        return;
      }
      onState(result.state);
      if (result.requiresRestart && result.state.phase === LicensePhase.Authorized) {
        window.setTimeout(() => void window.electron.appInfo.relaunch(), 700);
      }
    } catch {
      setError(i18nService.t('logicnestLicenseError'));
    } finally {
      setBusy(false);
    }
  };

  const logout = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onState(await window.electron.license.logout());
    } catch {
      setError(i18nService.t('logicnestLicenseError'));
    } finally {
      setBusy(false);
    }
  };

  const navItems = [
    { icon: CpuChipIcon, label: i18nService.t('logicnestLockedAgents') },
    { icon: ChatBubbleLeftRightIcon, label: i18nService.t('logicnestLockedSessions') },
    { icon: PuzzlePieceIcon, label: i18nService.t('logicnestLockedSkills') },
    { icon: CalendarDaysIcon, label: i18nService.t('logicnestLockedScheduledTasks') },
    { icon: CircleStackIcon, label: i18nService.t('logicnestLockedMcp') },
  ];

  return (
    <main className="fixed inset-0 z-[100] flex min-h-screen flex-col overflow-hidden bg-surface-raised text-foreground">
      <div aria-hidden="true" className="draggable h-9 shrink-0 border-b border-border bg-surface" />
      <WindowTitleBar />
      <div className="flex min-h-0 flex-1 gap-2 p-2 pt-0">
        <aside className="flex w-60 shrink-0 flex-col rounded-xl border border-border bg-surface p-3">
          <div className="mb-5 flex items-center gap-3 px-2 py-2">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-0.5">
              <img src="./logo.png" alt="" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{i18nService.t('logicnestLicenseTitle')}</p>
              <p className="truncate text-xs text-secondary">{i18nService.t('logicnestLockedWorkspace')}</p>
            </div>
          </div>
          <nav className="space-y-1" aria-label={i18nService.t('logicnestLockedNavigation')}>
            {navItems.map((item) => (
              <LockedNavigationItem key={item.label} {...item} onLocked={showLockedNotice} />
            ))}
          </nav>
          <div className="mt-auto rounded-xl border border-border bg-background px-3 py-3">
            <div className="flex items-center gap-2 text-xs text-secondary">
              <UserCircleIcon className="h-5 w-5 shrink-0" />
              <span className="truncate">{state.user?.phoneMasked || '—'}</span>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={busy}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-surface-raised disabled:opacity-50"
            >
              {i18nService.t('logicnestLicenseLogout')}
            </button>
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto rounded-xl border border-border bg-background p-6">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-7 shadow-[0_20px_70px_rgba(0,0,0,0.08)] dark:shadow-[0_20px_70px_rgba(0,0,0,0.32)]">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                <LockClosedIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">{i18nService.t('logicnestLockedTitle')}</h1>
                <p className="mt-1 text-sm leading-6 text-secondary">{i18nService.t('logicnestLockedDescription')}</p>
              </div>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-raised px-4 py-3">
                <p className="text-xs text-secondary">{i18nService.t('logicnestLockedAccount')}</p>
                <p className="mt-1 text-sm font-medium">{state.user?.phoneMasked || '—'}</p>
              </div>
              <div className="rounded-xl bg-surface-raised px-4 py-3">
                <p className="text-xs text-secondary">{i18nService.t('logicnestLockedMembership')}</p>
                <p className="mt-1 text-sm font-medium">{i18nService.t('logicnestLockedInactive')}</p>
              </div>
            </div>

            <form onSubmit={(event) => void redeem(event)} className="space-y-4">
              <label className="block text-sm text-secondary">
                {i18nService.t('logicnestLicenseActivationCode')}
                <input
                  value={activationCode}
                  onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
                  placeholder="LQGX-XXXX-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  required
                  className="mt-1.5 w-full rounded-xl border border-border-input bg-background px-3.5 py-3 font-mono tracking-wide text-foreground outline-none transition placeholder:text-muted focus:border-foreground"
                />
              </label>
              <p className="text-xs text-secondary">{i18nService.t('logicnestLicenseActivationHint')}</p>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? '…' : i18nService.t('logicnestLicenseRedeem')}
              </button>
            </form>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="mt-4 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground">
                {notice}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export const LogicNestWorkspaceStarting: React.FC = () => (
  <main className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
    <div aria-hidden="true" className="draggable absolute inset-x-0 top-0 h-9 border-b border-border bg-surface" />
    <WindowTitleBar />
    <div className="flex max-w-md flex-col items-center text-center">
      <div className="mb-6 h-10 w-10 animate-spin rounded-full border-2 border-border border-t-foreground" />
      <h1 className="text-xl font-semibold">{i18nService.t('logicnestWorkspaceStarting')}</h1>
      <p className="mt-2 text-sm leading-6 text-secondary">{i18nService.t('logicnestWorkspaceStartingHint')}</p>
    </div>
  </main>
);

export const LogicNestRestrictedView: React.FC<LicenseStateViewProps> = ({ state, onState }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onState(await window.electron.license.logout());
    } catch {
      setError(i18nService.t('logicnestLicenseError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div aria-hidden="true" className="draggable absolute inset-x-0 top-0 h-9 border-b border-border bg-surface" />
      <WindowTitleBar />
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-[0_20px_70px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-700 dark:text-red-300">
          <LockClosedIcon className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">{i18nService.t('logicnestLicenseRestricted')}</h1>
        <p className="mt-2 text-sm leading-6 text-secondary">
          {state.message || i18nService.t('logicnestRestrictedHint')}
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-85 disabled:opacity-50"
        >
          {i18nService.t('logicnestLicenseLogout')}
        </button>
        {error && <p role="alert" className="mt-4 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
      </section>
    </main>
  );
};
