import { PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';

import {
  BrowserNetworkMode,
  BrowserProfileMode,
  type BrowserWebAccessConfig,
  normalizeBrowserHostnameList,
} from '../../../shared/browserWebAccess/constants';
import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import ThemedSelect from '../ui/ThemedSelect';
import { SettingsField, SettingsSection, SettingsStatus } from './SettingsCenterLayout';

interface BrowserWebAccessSettingsProps {
  value: BrowserWebAccessConfig;
  onChange: (value: BrowserWebAccessConfig) => void;
}

const HostnameListTarget = {
  BlockedHostnames: 'blockedHostnames',
} as const;

type HostnameListTarget = typeof HostnameListTarget[keyof typeof HostnameListTarget];

const HostnameList: React.FC<{
  title: string;
  description: string;
  hostnames: string[];
  onAdd: () => void;
  onRemove: (hostname: string) => void;
}> = ({ title, description, hostnames, onAdd, onRemove }) => (
  <div className="space-y-3">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <p className="mt-1 text-sm text-secondary">{description}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-surface-raised px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        <PlusIcon className="h-4 w-4" />
        {i18nService.t('add')}
      </button>
    </div>

    <div className="border-y border-border bg-background">
      {hostnames.length > 0 ? (
        hostnames.map((hostname, index) => (
          <div
            key={hostname}
            className={`flex min-h-12 items-center justify-between gap-3 px-3 py-2 ${
              index > 0 ? 'border-t border-border' : ''
            }`}
          >
            <span className="truncate text-sm text-foreground">{hostname}</span>
            <button
              type="button"
              onClick={() => onRemove(hostname)}
              className="rounded-md p-1 text-secondary transition-colors hover:bg-surface-raised hover:text-red-500"
              title={i18nService.t('delete')}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))
      ) : (
        <div className="px-3 py-3 text-sm text-secondary">
          {i18nService.t('browserHostnameListEmpty')}
        </div>
      )}
    </div>
  </div>
);

const BrowserWebAccessSettings: React.FC<BrowserWebAccessSettingsProps> = ({
  value,
  onChange,
}) => {
  const [hostnameDialogTarget, setHostnameDialogTarget] = useState<HostnameListTarget | null>(null);
  const [hostnameDraft, setHostnameDraft] = useState('');
  const hostnameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hostnameDialogTarget) {
      hostnameInputRef.current?.focus();
    }
  }, [hostnameDialogTarget]);

  const update = (patch: Partial<BrowserWebAccessConfig>) => {
    onChange({
      ...value,
      browserEnabled: true,
      profileMode: BrowserProfileMode.Managed,
      ...patch,
    });
  };

  const updateHostnames = (hostnames: string[]) => {
    update({ blockedHostnames: normalizeBrowserHostnameList(hostnames) });
  };

  const openHostnameDialog = (target: HostnameListTarget) => {
    setHostnameDraft('');
    setHostnameDialogTarget(target);
  };

  const closeHostnameDialog = () => {
    setHostnameDialogTarget(null);
    setHostnameDraft('');
  };

  const normalizedHostnameDraft = normalizeBrowserHostnameList([hostnameDraft])[0] ?? '';
  const currentDialogHostnames = hostnameDialogTarget ? value.blockedHostnames : [];
  const canAddHostname = Boolean(
    hostnameDialogTarget
    && normalizedHostnameDraft
    && !currentDialogHostnames.includes(normalizedHostnameDraft),
  );

  const submitHostnameDialog = () => {
    if (!hostnameDialogTarget || !canAddHostname) {
      return;
    }

    updateHostnames([...currentDialogHostnames, normalizedHostnameDraft]);
    closeHostnameDialog();
  };

  const removeHostname = (hostname: string) => {
    updateHostnames(value.blockedHostnames.filter(item => item !== hostname));
  };

  const hostnameDialogTitle = i18nService.t('browserAddBlockedHostnameTitle');
  const hostnameDialogDescription = i18nService.t('browserAddBlockedHostnameDescription');

  const networkModeDescription = value.networkMode === BrowserNetworkMode.PrivateNetworkAccess
    ? i18nService.t('browserNetworkOpenDescription')
    : i18nService.t('browserNetworkStrictDescription');

  return (
    <>
      <div>
        <SettingsSection
          title={i18nService.t('browserNetworkSectionTitle')}
          description={i18nService.t('settingsTabBrowserDescription')}
        >
          <SettingsField>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-foreground">
                  {value.networkMode === BrowserNetworkMode.Strict
                    ? i18nService.t('browserNetworkStrict')
                    : i18nService.t('browserNetworkOpen')}
                </h4>
                <p className="mt-1 text-sm leading-6 text-secondary">{networkModeDescription}</p>
              </div>
              <div className="w-full shrink-0 sm:w-[300px]">
              <ThemedSelect
                id="browser-network-mode"
                value={value.networkMode}
                onChange={(mode) => update({ networkMode: mode as BrowserNetworkMode })}
                options={[
                  { value: BrowserNetworkMode.Strict, label: i18nService.t('browserNetworkStrict') },
                  { value: BrowserNetworkMode.PrivateNetworkAccess, label: i18nService.t('browserNetworkOpen') },
                ]}
              />
              </div>
            </div>
          </SettingsField>
          {value.networkMode === BrowserNetworkMode.PrivateNetworkAccess && (
            <SettingsField>
              <SettingsStatus tone="warning">{i18nService.t('browserNetworkOpenDescription')}</SettingsStatus>
            </SettingsField>
          )}
        </SettingsSection>

        <SettingsSection
          title={i18nService.t('browserBlockedHostnames')}
          description={i18nService.t('browserBlockedHostnamesDescription')}
        >
          <HostnameList
            title={i18nService.t('browserBlockedHostnames')}
            description={i18nService.t('browserBlockedHostnamesDescription')}
            hostnames={value.blockedHostnames}
            onAdd={() => openHostnameDialog(HostnameListTarget.BlockedHostnames)}
            onRemove={removeHostname}
          />
        </SettingsSection>

      </div>

      {hostnameDialogTarget ? (
        <Modal
          onClose={closeHostnameDialog}
          overlayClassName="fixed inset-0 z-[60] flex items-center justify-center bg-black/25"
          className="w-full max-w-[420px] rounded-2xl border border-border bg-background p-5 shadow-modal"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{hostnameDialogTitle}</h3>
              <p className="mt-2 text-sm text-secondary">{hostnameDialogDescription}</p>
            </div>
            <button
              type="button"
              onClick={closeHostnameDialog}
              className="rounded-md p-1 text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          <input
            ref={hostnameInputRef}
            type="text"
            value={hostnameDraft}
            onChange={(event) => setHostnameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitHostnameDialog();
              }
            }}
            placeholder={i18nService.t('browserHostnameInputPlaceholder')}
            className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-secondary focus:border-primary focus:ring-1 focus:ring-primary/40"
          />

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeHostnameDialog}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised"
            >
              {i18nService.t('cancel')}
            </button>
            <button
              type="button"
              onClick={submitHostnameDialog}
              disabled={!canAddHostname}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-white"
            >
              {i18nService.t('add')}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
};

export default BrowserWebAccessSettings;
