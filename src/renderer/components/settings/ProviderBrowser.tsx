import { XCircleIcon as XCircleIconSolid } from '@heroicons/react/20/solid';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import React from 'react';

import { ProviderCategory, ProviderRegistry } from '../../../shared/providers';
import { getCustomProviderDefaultName, getProviderDisplayName, isCustomProvider } from '../../config';
import { getProviderIcon } from '../../providers/uiRegistry';
import { i18nService } from '../../services/i18n';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import TrashIcon from '../icons/TrashIcon';
import {
  CUSTOM_PROVIDER_KEYS,
  filterProviderKeysBySearch,
  getProviderKeysForCategory,
  hasProviderAuthConfigured,
  PROVIDER_CATEGORY_ORDER,
  type ProviderConfig,
  type ProvidersConfig,
  type ProviderType,
} from './modelProviderUtils';

const CATEGORY_LABEL_KEYS: Record<ProviderCategory, string> = {
  [ProviderCategory.International]: 'providerCategoryInternational',
  [ProviderCategory.Domestic]: 'providerCategoryDomestic',
  [ProviderCategory.Local]: 'providerCategoryLocal',
  [ProviderCategory.Custom]: 'providerCategoryCustom',
};

interface ProviderBrowserProps {
  providers: ProvidersConfig;
  activeProvider: ProviderType;
  activeCategory: ProviderCategory;
  isImportingProviders: boolean;
  isExportingProviders: boolean;
  importInputRef: React.RefObject<HTMLInputElement>;
  onCategoryChange: (category: ProviderCategory) => void;
  onProviderChange: (provider: ProviderType) => void;
  onToggleProvider: (provider: ProviderType) => void;
  onProviderAuthRequired: (provider: ProviderType) => void;
  onAddCustomProvider: () => void;
  onDeleteCustomProvider: (provider: ProviderType) => void;
  onImportProvidersClick: () => void;
  onExportProviders: () => void;
  onImportProviders: (event: React.ChangeEvent<HTMLInputElement>) => void;
  getProviderAuthRequirementHint: (provider: ProviderType, config: ProviderConfig) => string;
}

const ProviderBrowser: React.FC<ProviderBrowserProps> = ({
  providers,
  activeProvider,
  activeCategory,
  isImportingProviders,
  isExportingProviders,
  importInputRef,
  onCategoryChange,
  onProviderChange,
  onToggleProvider,
  onProviderAuthRequired,
  onAddCustomProvider,
  onDeleteCustomProvider,
  onImportProvidersClick,
  onExportProviders,
  onImportProviders,
  getProviderAuthRequirementHint,
}) => {
  const [providerFilter, setProviderFilter] = React.useState('');

  React.useEffect(() => {
    setProviderFilter('');
  }, [activeCategory]);

  const categoryProviderKeys = getProviderKeysForCategory(activeCategory, providers);
  const filteredProviderKeys = filterProviderKeysBySearch(
    categoryProviderKeys,
    providers,
    providerFilter,
  );
  const enabledProviderCount = categoryProviderKeys.filter(provider => {
    const config = providers[provider];
    return config.enabled && hasProviderAuthConfigured(provider, config);
  }).length;
  const isEmptyCustomCategory = activeCategory === ProviderCategory.Custom
    && categoryProviderKeys.length === 0;
  const canAddCustomProvider = CUSTOM_PROVIDER_KEYS.some(key => !providers[key]);

  return (
    <div className="flex min-h-0 w-full flex-col border-b border-border pb-5">
      <div className="shrink-0 space-y-3 pb-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h3 className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{i18nService.t('modelProviders')}</span>
            {!isEmptyCustomCategory && (
              <span className="shrink-0 text-[10px] font-normal text-muted">
                {enabledProviderCount}/{categoryProviderKeys.length} {i18nService.t('providersEnabledSuffix')}
              </span>
            )}
          </h3>
          <div className="flex shrink-0 items-center space-x-1">
            <button
              type="button"
              onClick={onImportProvidersClick}
              disabled={isImportingProviders || isExportingProviders}
              className="inline-flex items-center px-2 py-1 text-[11px] font-medium rounded-lg border border-border text-foreground hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
            >
              {i18nService.t('import')}
            </button>
            <button
              type="button"
              onClick={onExportProviders}
              disabled={isImportingProviders || isExportingProviders}
              className="inline-flex items-center px-2 py-1 text-[11px] font-medium rounded-lg border border-border text-foreground hover:bg-surface-raised disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
            >
              {i18nService.t('export')}
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label={i18nService.t('providerCategoryTabsLabel')}
          className="flex flex-wrap gap-1 border-y border-border py-2"
        >
          {PROVIDER_CATEGORY_ORDER.map(category => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={activeCategory === category}
              onClick={() => onCategoryChange(category)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                activeCategory === category
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-raised text-secondary hover:text-foreground hover:bg-surface'
              }`}
            >
              {i18nService.t(CATEGORY_LABEL_KEYS[category])}
            </button>
          ))}
        </div>

        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
            placeholder={i18nService.t('searchProviders')}
            className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text pl-8 pr-7 py-1.5 text-xs"
          />
          {providerFilter && (
            <button
              type="button"
              onClick={() => setProviderFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
              title={i18nService.t('clear')}
            >
              <XCircleIconSolid className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={onImportProviders}
      />

      <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 pb-1">
        {filteredProviderKeys.map(providerKey => {
          const config = providers[providerKey];
          const customProvider = isCustomProvider(providerKey);
          const displayLabel = customProvider
            ? (config.displayName || getCustomProviderDefaultName(providerKey))
            : (ProviderRegistry.get(providerKey)?.label ?? getProviderDisplayName(providerKey));
          const hasValidAuth = hasProviderAuthConfigured(providerKey, config);
          const effectiveEnabled = config.enabled && hasValidAuth;
          const canToggleProvider = effectiveEnabled || hasValidAuth;

          return (
            <div
              key={providerKey}
              onClick={() => onProviderChange(providerKey)}
              className={`group flex min-h-[62px] items-center border p-3 cursor-pointer transition-colors ${
                activeProvider === providerKey
                  ? 'border-foreground bg-surface-raised'
                  : 'border-border bg-background hover:border-secondary hover:bg-surface-raised'
              }`}
            >
              <div className="flex flex-1 items-center min-w-0">
                <div className="mr-2 flex h-7 w-7 items-center justify-center shrink-0">
                  <span className="text-foreground">{getProviderIcon(providerKey)}</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm font-medium text-foreground">
                    {displayLabel}
                  </span>
                  {customProvider && (
                    <span className="text-[9px] leading-tight mt-0.5 text-primary">
                      {i18nService.t('customBadge')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center ml-2 gap-1">
                {customProvider && (
                  <button
                    type="button"
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-secondary hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:bg-red-400/10 transition-all"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteCustomProvider(providerKey);
                    }}
                    title={i18nService.t('deleteCustomProvider')}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                <div
                  title={!canToggleProvider
                    ? getProviderAuthRequirementHint(providerKey, config)
                    : undefined}
                  className={`w-7 h-4 rounded-full flex items-center transition-colors ${
                    effectiveEnabled ? 'bg-primary' : 'bg-gray-400 dark:bg-gray-600'
                  } ${canToggleProvider ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!canToggleProvider) {
                      onProviderAuthRequired(providerKey);
                      return;
                    }
                    onToggleProvider(providerKey);
                  }}
                >
                  <div className={`w-3 h-3 rounded-full bg-white shadow-md transform transition-transform ${
                    effectiveEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {filteredProviderKeys.length === 0 && !isEmptyCustomCategory && (
          <div className="px-2 py-6 text-center text-xs text-secondary">
            {i18nService.t('noProvidersFound')}
          </div>
        )}

        {isEmptyCustomCategory && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-secondary">{i18nService.t('customProvidersEmpty')}</p>
          </div>
        )}

        {activeCategory === ProviderCategory.Custom && canAddCustomProvider && (
          <button
            type="button"
            onClick={onAddCustomProvider}
            className="w-full flex items-center justify-center gap-1 p-2 rounded-xl border border-dashed border-claude-border dark:border-claude-darkBorder text-claude-secondaryText dark:text-claude-darkSecondaryText hover:border-claude-accent hover:text-claude-accent transition-colors text-sm"
          >
            <PlusCircleIcon className="h-4 w-4" />
            {i18nService.t('addCustomProvider')}
          </button>
        )}
      </div>
    </div>
  );
};

export default ProviderBrowser;
