import { ArrowUpTrayIcon, CheckIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';

import { i18nService } from '../../services/i18n';
import {
  cropAvatarDataUrl,
  PersonalizationAvatarKind,
  presetAvatarOptions,
  resolvePersonalizationAvatarUrl,
  UserPersonalizationLimits,
  type UserPersonalizationV1,
} from '../../services/userPersonalization';
import { SettingsField, SettingsSection } from './SettingsCenterLayout';

interface PersonalizationSettingsProps {
  value: UserPersonalizationV1;
  onChange: (value: UserPersonalizationV1) => void;
  disabled?: boolean;
}

const avatarOptionClassName =
  'relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border bg-surface transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const PersonalizationSettings: React.FC<PersonalizationSettingsProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const selectedAvatarUrl = resolvePersonalizationAvatarUrl(value.avatar);

  const uploadAvatar = async (): Promise<void> => {
    if (disabled || isUploading) return;
    setUploadError(null);
    const selection = await window.electron.dialog.selectFile({
      title: i18nService.t('personalizationUploadAvatar'),
      filters: [{
        name: i18nService.t('personalizationImageFiles'),
        extensions: ['png', 'jpg', 'jpeg', 'webp'],
      }],
    });
    if (!selection.success || !selection.path) return;

    setIsUploading(true);
    try {
      const stat = await window.electron.dialog.statFile(selection.path);
      if (!stat.success || !stat.isFile || typeof stat.size !== 'number') {
        throw new Error(i18nService.t('personalizationAvatarReadFailed'));
      }
      if (stat.size > UserPersonalizationLimits.UploadBytes) {
        throw new Error(i18nService.t('personalizationAvatarTooLarge'));
      }
      const result = await window.electron.dialog.readFileAsDataUrl(selection.path);
      if (
        !result.success
        || !result.dataUrl
        || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(result.dataUrl)
      ) {
        throw new Error(i18nService.t('personalizationAvatarUnsupported'));
      }
      const dataUrl = await cropAvatarDataUrl(result.dataUrl);
      onChange({
        ...value,
        avatar: { kind: PersonalizationAvatarKind.Custom, dataUrl },
      });
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message
          ? error.message
          : i18nService.t('personalizationAvatarReadFailed'),
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <SettingsSection
        title={i18nService.t('personalizationProfileTitle')}
        description={i18nService.t('personalizationProfileDescription')}
      >
        <SettingsField>
          <div className="flex items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-raised">
              {selectedAvatarUrl ? (
                <img
                  src={selectedAvatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserCircleIcon className="h-10 w-10 text-secondary" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-secondary">
                  {i18nService.t('personalizationDisplayName')}
                </span>
                <input
                  value={value.displayName}
                  maxLength={UserPersonalizationLimits.DisplayName}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...value, displayName: event.currentTarget.value })}
                  placeholder={i18nService.t('personalizationDisplayNamePlaceholder')}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-secondary/60 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-secondary">
                  {i18nService.t('personalizationSignature')}
                </span>
                <input
                  value={value.signature}
                  maxLength={UserPersonalizationLimits.Signature}
                  disabled={disabled}
                  onChange={(event) => onChange({ ...value, signature: event.currentTarget.value })}
                  placeholder={i18nService.t('personalizationSignaturePlaceholder')}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-secondary/60 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </label>
          </div>
          </div>
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title={i18nService.t('personalizationAvatarTitle')}
        description={i18nService.t('personalizationAvatarDescription')}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-3">
          <button
            type="button"
            disabled={disabled}
            aria-label={i18nService.t('personalizationDefaultAvatar')}
            aria-pressed={value.avatar === null}
            onClick={() => onChange({ ...value, avatar: null })}
            className={`${avatarOptionClassName} ${
              value.avatar === null ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <UserCircleIcon className="h-9 w-9 text-secondary" aria-hidden="true" />
            {value.avatar === null && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
                <CheckIcon className="h-3 w-3" />
              </span>
            )}
          </button>

          {presetAvatarOptions.map((option) => {
            const selected = value.avatar?.kind === PersonalizationAvatarKind.Preset
              && value.avatar.presetId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                aria-label={`${i18nService.t('personalizationPresetAvatar')} ${option.id}`}
                aria-pressed={selected}
                onClick={() => onChange({
                  ...value,
                  avatar: { kind: PersonalizationAvatarKind.Preset, presetId: option.id },
                })}
                className={`${avatarOptionClassName} ${
                  selected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <img src={option.url} alt="" className="h-full w-full object-cover" />
                {selected && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            disabled={disabled || isUploading}
            aria-label={i18nService.t('personalizationUploadAvatar')}
            onClick={() => { void uploadAvatar(); }}
            className={`${avatarOptionClassName} flex-col gap-1 border-dashed border-border text-secondary hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <ArrowUpTrayIcon className="h-6 w-6" aria-hidden="true" />
            <span className="text-[10px] font-medium">
              {isUploading
                ? i18nService.t('personalizationUploading')
                : i18nService.t('personalizationUpload')}
            </span>
          </button>
        </div>

        {uploadError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {uploadError}
          </p>
        )}
      </SettingsSection>
    </div>
  );
};

export default PersonalizationSettings;
