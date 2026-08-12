import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import React, { useMemo, useState } from 'react';

import type {
  LicenseActionResponse,
  LicenseCredentials,
  LicenseRegistration,
  LicenseState,
} from '../../../shared/license';
import { LicensePhase } from '../../../shared/license';
import { i18nService } from '../../services/i18n';
import WindowTitleBar from '../window/WindowTitleBar';
import {
  CHINA_CALLING_CODE,
  formatChinaMobileE164,
  normalizeChinaMobileInput,
} from './chinaPhoneInput';

interface LogicNestLicenseGateProps {
  state: LicenseState;
  onState: (state: LicenseState) => void;
}

const isActionError = (result: LicenseActionResponse): result is { error: { code: string; message: string } } =>
  'error' in result;

const formatDate = (value: string | undefined): string => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

const interpolate = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template);

const LogicNestLicenseGate: React.FC<LogicNestLicenseGateProps> = ({ state, onState }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const needsActivation = state.phase === LicensePhase.ActivationRequired
    || (state.user !== null && state.membership.status !== 'active' && state.phase !== LicensePhase.Authorized && state.phase !== LicensePhase.OfflineGrace);
  const statusText = useMemo(() => {
    if (state.phase === LicensePhase.Restricted) return state.message || i18nService.t('logicnestLicenseRestricted');
    if (state.phase === LicensePhase.OfflineGrace && state.offlineUntil) {
      return interpolate(i18nService.t('logicnestLicenseOfflineUntil'), { time: formatDate(state.offlineUntil) });
    }
    if (state.phase === LicensePhase.SignedOut) return null;
    if (state.phase === LicensePhase.ActivationRequired) return i18nService.t('logicnestLicenseNeedActivation');
    return state.message || '';
  }, [state]);

  const applyResult = async (result: LicenseActionResponse): Promise<void> => {
    if (isActionError(result)) {
      setError(result.error.message || i18nService.t('logicnestLicenseError'));
      return;
    }
    onState(result.state);
    setError(null);
    if (result.requiresRestart && result.state.phase === LicensePhase.Authorized) {
      setNotice(i18nService.t('logicnestLicenseRestart'));
      window.setTimeout(() => void window.electron.appInfo.relaunch(), 700);
    }
  };

  const submitCredentials = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const credentials: LicenseCredentials = { phone: formatChinaMobileE164(phone), password };
      const result = mode === 'login'
        ? await window.electron.license.login(credentials)
        : await window.electron.license.register({ ...credentials, passwordConfirmation } as LicenseRegistration);
      await applyResult(result);
    } catch {
      setError(i18nService.t('logicnestLicenseError'));
    } finally {
      setBusy(false);
    }
  };

  const redeem = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await applyResult(await window.electron.license.redeem(activationCode.trim()));
    } catch {
      setError(i18nService.t('logicnestLicenseError'));
    } finally {
      setBusy(false);
    }
  };

  const logout = async (): Promise<void> => {
    setBusy(true);
    try {
      onState(await window.electron.license.logout());
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-auto bg-background px-4 pb-8 pt-14 text-foreground">
      <div
        aria-hidden="true"
        className="draggable absolute inset-x-0 top-0 z-[54] h-9 border-b border-border bg-surface-raised"
      />
      <WindowTitleBar />
      <section className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.12)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="px-7 pb-8 pt-7">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white p-1 shadow-sm">
              <img src="./logo.png" alt={i18nService.t('logicnestLicenseTitle')} className="h-full w-full object-contain" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{i18nService.t('logicnestLicenseTitle')}</h1>
          </div>

          {(statusText || state.membership.status === 'active') && (
            <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${state.phase === LicensePhase.Restricted ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-border bg-surface-raised text-foreground'}`}>
              <p>{statusText}</p>
              {state.membership.status === 'active' && (
                <p className="mt-1 text-xs text-secondary">
                  {interpolate(i18nService.t('logicnestLicenseMembership'), {
                    plan: state.membership.planCode || '—',
                    time: formatDate(state.membership.expiresAt),
                  })}
                </p>
              )}
            </div>
          )}

          {state.user && state.phase !== LicensePhase.SignedOut && (
            <div className="mb-5 flex items-center justify-between rounded-xl bg-surface-raised px-4 py-3 text-xs text-secondary">
              <span>{state.user.phoneMasked}</span>
              <button type="button" onClick={() => void logout()} disabled={busy} className="font-medium text-foreground hover:opacity-60 disabled:opacity-50">
                {i18nService.t('logicnestLicenseLogout')}
              </button>
            </div>
          )}

          {!needsActivation && (
            <>
              <div className="mb-5 grid grid-cols-2 rounded-xl bg-surface-raised p-1">
                <button type="button" onClick={() => { setMode('login'); setError(null); }} className={`rounded-lg px-3 py-2 text-sm transition ${mode === 'login' ? 'bg-surface font-medium text-foreground shadow-sm' : 'text-secondary hover:text-foreground'}`}>
                  {i18nService.t('logicnestLicenseLogin')}
                </button>
                <button type="button" onClick={() => { setMode('register'); setError(null); }} className={`rounded-lg px-3 py-2 text-sm transition ${mode === 'register' ? 'bg-surface font-medium text-foreground shadow-sm' : 'text-secondary hover:text-foreground'}`}>
                  {i18nService.t('logicnestLicenseRegister')}
                </button>
              </div>
              <form onSubmit={(event) => void submitCredentials(event)} className="space-y-4">
                <label className="block text-sm text-secondary">
                  {i18nService.t('logicnestLicensePhone')}
                  <div className="mt-1.5 flex overflow-hidden rounded-xl border border-border-input bg-background transition focus-within:border-foreground">
                    <select
                      aria-label={i18nService.t('logicnestLicenseCountryCode')}
                      defaultValue={CHINA_CALLING_CODE}
                      className="w-24 shrink-0 border-r border-border-input bg-surface-raised px-3.5 py-3 text-foreground outline-none"
                    >
                      <option value={CHINA_CALLING_CODE}>{CHINA_CALLING_CODE}</option>
                    </select>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(normalizeChinaMobileInput(event.target.value))}
                      autoComplete="tel-national"
                      inputMode="numeric"
                      pattern="1[3-9][0-9]{9}"
                      maxLength={11}
                      required
                      className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-foreground outline-none"
                    />
                  </div>
                </label>
                <label className="block text-sm text-secondary">
                  {i18nService.t('logicnestLicensePassword')}
                  <div className="relative mt-1.5">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} className="w-full rounded-xl border border-border-input bg-background py-3 pl-3.5 pr-12 text-foreground outline-none transition focus:border-foreground" />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-secondary transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/30"
                      aria-label={i18nService.t(showPassword ? 'logicnestLicenseHidePassword' : 'logicnestLicenseShowPassword')}
                      title={i18nService.t(showPassword ? 'logicnestLicenseHidePassword' : 'logicnestLicenseShowPassword')}
                    >
                      {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                </label>
                {mode === 'register' && (
                  <label className="block text-sm text-secondary">
                    {i18nService.t('logicnestLicenseConfirmPassword')}
                    <div className="relative mt-1.5">
                      <input type={showPasswordConfirmation ? 'text' : 'password'} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" required minLength={8} className="w-full rounded-xl border border-border-input bg-background py-3 pl-3.5 pr-12 text-foreground outline-none transition focus:border-foreground" />
                      <button
                        type="button"
                        onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-secondary transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/30"
                        aria-label={i18nService.t(showPasswordConfirmation ? 'logicnestLicenseHidePassword' : 'logicnestLicenseShowPassword')}
                        title={i18nService.t(showPasswordConfirmation ? 'logicnestLicenseHidePassword' : 'logicnestLicenseShowPassword')}
                      >
                        {showPasswordConfirmation ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                  </label>
                )}
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-85 disabled:cursor-wait disabled:opacity-60">
                  {busy ? '…' : i18nService.t('logicnestLicenseSubmit')}
                </button>
              </form>
              <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} className="mt-4 w-full text-center text-xs font-medium text-foreground hover:opacity-60">
                {i18nService.t(mode === 'login' ? 'logicnestLicenseSwitchToRegister' : 'logicnestLicenseSwitchToLogin')}
              </button>
            </>
          )}

          {needsActivation && (
            <form onSubmit={(event) => void redeem(event)} className="space-y-4">
              <label className="block text-sm text-secondary">
                {i18nService.t('logicnestLicenseActivationCode')}
                <input value={activationCode} onChange={(event) => setActivationCode(event.target.value.toUpperCase())} placeholder="LQGX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" required className="mt-1.5 w-full rounded-xl border border-border-input bg-background px-3.5 py-3 font-mono tracking-wide text-foreground outline-none transition placeholder:text-muted focus:border-foreground" />
              </label>
              <p className="text-xs text-secondary">{i18nService.t('logicnestLicenseActivationHint')}</p>
              <button type="submit" disabled={busy} className="w-full rounded-xl bg-foreground px-4 py-3 font-semibold text-background transition hover:opacity-85 disabled:cursor-wait disabled:opacity-60">
                {busy ? '…' : i18nService.t('logicnestLicenseRedeem')}
              </button>
            </form>
          )}

          {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-foreground">{notice}</p>}
        </div>
      </section>
    </main>
  );
};

export default LogicNestLicenseGate;
