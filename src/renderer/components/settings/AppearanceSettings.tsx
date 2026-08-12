import React from 'react';

import { BRAND } from '../../../shared/brand';
import { FontPreferences } from '../../config';
import { i18nService } from '../../services/i18n';
import { themeService } from '../../services/theme';
import { SettingsField, SettingsSection } from './SettingsCenterLayout';
import { SettingsNumberInputRow } from './SettingsControls';

type ThemeMode = 'light' | 'dark' | 'system';

interface AppearanceSettingsProps {
  theme: ThemeMode;
  themeId: string;
  isChanging: boolean;
  uiFontSize: number;
  codeFontSize: number;
  onThemeModeChange: (mode: ThemeMode) => void | Promise<void>;
  onThemeIdChange: (themeId: string) => void | Promise<void>;
  onUiFontSizeChange: (value: number) => void;
  onCodeFontSizeChange: (value: number) => void;
}

const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  theme,
  themeId,
  isChanging,
  uiFontSize,
  codeFontSize,
  onThemeModeChange,
  onThemeIdChange,
  onUiFontSizeChange,
  onCodeFontSizeChange,
}) => {
  const allThemes = themeService.getAllThemes()
    .filter((themeDefinition) => BRAND.appearance.visibleThemeIds.includes(themeDefinition.meta.id));
  const lightPalette = allThemes.find((item) => item.meta.id === 'classic-light')?.meta.preview
    ?? ['#ffffff', '#f4f4f5', '#18181b', '#71717a'];
  const darkPalette = allThemes.find((item) => item.meta.id === 'classic-dark')?.meta.preview
    ?? ['#18181b', '#27272a', '#fafafa', '#a1a1aa'];
  const modePalettes = {
    light: lightPalette,
    dark: darkPalette,
    system: [lightPalette[0], lightPalette[2], darkPalette[0], darkPalette[2]],
  } as const;

  return (
    <div>
      <SettingsSection
        title={i18nService.t('settingsAppearanceModeTitle')}
        description={i18nService.t('settingsAppearanceModeDescription')}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['light', 'dark', 'system'] as const).map((mode) => {
            const isSelected = theme === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => void onThemeModeChange(mode)}
                disabled={isChanging}
                aria-pressed={isSelected}
                className={`border p-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  isSelected
                    ? 'border-foreground bg-surface-raised'
                    : 'border-border bg-background hover:border-secondary'
                }`}
              >
                <span className="grid h-9 grid-cols-4 overflow-hidden border border-border">
                  {modePalettes[mode].map((color, index) => (
                    <span key={`${mode}-${index}`} style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="mt-3 block text-sm font-medium text-foreground">
                  {i18nService.t(mode)}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title={i18nService.t('settingsAppearanceThemeTitle')}
        description={i18nService.t('settingsAppearanceThemeDescription')}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {allThemes.map((themeDefinition) => {
            const isSelected = themeId === themeDefinition.meta.id;
            return (
              <button
                key={themeDefinition.meta.id}
                type="button"
                onClick={() => void onThemeIdChange(themeDefinition.meta.id)}
                disabled={isChanging}
                aria-pressed={isSelected}
                className={`border p-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  isSelected
                    ? 'border-foreground bg-surface-raised'
                    : 'border-border bg-background hover:border-secondary'
                }`}
              >
                <span className="grid h-10 grid-cols-4 overflow-hidden border border-border">
                  {themeDefinition.meta.preview.map((color, index) => (
                    <span key={`${themeDefinition.meta.id}-${index}`} style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="mt-3 block truncate text-xs font-medium text-foreground">
                  {i18nService.t(`theme-name-${themeDefinition.meta.id}`) || themeDefinition.meta.name}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title={i18nService.t('settingsAppearanceTypographyTitle')}
        description={i18nService.t('settingsAppearanceTypographyDescription')}
      >
        <SettingsField>
          <SettingsNumberInputRow
            id="ui-font-size"
            title={i18nService.t('uiFontSize')}
            description={i18nService.t('uiFontSizeDescription')}
            value={uiFontSize}
            min={FontPreferences.UiFontSizeMin}
            max={FontPreferences.UiFontSizeMax}
            onChange={onUiFontSizeChange}
          />
        </SettingsField>
        <SettingsField>
          <SettingsNumberInputRow
            id="code-font-size"
            title={i18nService.t('codeFontSize')}
            description={i18nService.t('codeFontSizeDescription')}
            value={codeFontSize}
            min={FontPreferences.CodeFontSizeMin}
            max={FontPreferences.CodeFontSizeMax}
            onChange={onCodeFontSizeChange}
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
};

export default AppearanceSettings;
