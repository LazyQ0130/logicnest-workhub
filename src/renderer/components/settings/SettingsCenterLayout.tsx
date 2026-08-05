import {
  ArrowLeftIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import React, { type KeyboardEvent, type ReactNode } from 'react';

import type { SettingsTabId } from '../../config/brandUi';
import type {
  SettingsSearchResult,
  VisibleSettingsModule,
} from './settingsInformationArchitecture';

type Translate = (key: string) => string;

export const SettingsCenterToolbar: React.FC<{
  isHome: boolean;
  query: string;
  results: readonly SettingsSearchResult[];
  translate: Translate;
  onBack: () => void;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onResultSelect: (tabId: SettingsTabId) => void;
  actions?: ReactNode;
}> = ({
  isHome,
  query,
  results,
  translate,
  onBack,
  onClose,
  onQueryChange,
  onResultSelect,
  actions,
}) => (
  <header className="non-draggable relative z-20 shrink-0 border-b border-border bg-background">
    <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-4 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        aria-label={isHome ? translate('close') : translate('settingsCenterBack')}
        className="non-draggable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface/70 text-secondary transition-colors hover:border-border hover:bg-surface-raised hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ArrowLeftIcon className="h-4 w-4" />
      </button>
      <h1 className="hidden shrink-0 text-base font-semibold tracking-tight text-foreground sm:block">
        {translate('settingsCenterTitle')}
      </h1>
      <div className="relative min-w-0 flex-1 sm:ml-3 sm:max-w-xl">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder={translate('settingsCenterSearchPlaceholder')}
          aria-label={translate('settingsCenterSearchPlaceholder')}
          className="h-10 w-full rounded-xl border border-border-subtle bg-surface-raised/45 pl-9 pr-3 text-sm text-foreground outline-none transition-[border-color,background-color,box-shadow] placeholder:text-secondary/70 hover:bg-surface-raised/65 focus:border-foreground/50 focus:bg-surface focus:ring-2 focus:ring-foreground/10"
        />
        {query.trim() && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] max-h-[min(24rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-border bg-background shadow-popover">
            <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">
              {translate('settingsCenterSearchResults')}
            </div>
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-secondary">
                {translate('settingsCenterSearchNoResults')}
              </p>
            ) : results.map(({ module, tab }) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onResultSelect(tab.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-3 py-3 text-left last:border-b-0 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{translate(tab.labelKey)}</span>
                  <span className="mt-0.5 block truncate text-xs text-secondary">
                    {translate(module.labelKey)} · {translate(tab.descriptionKey)}
                  </span>
                </span>
                <ArrowRightIcon className="h-4 w-4 text-secondary" />
              </button>
            ))}
          </div>
        )}
      </div>
      {actions}
      <button
        type="button"
        onClick={onClose}
        aria-label={translate('close')}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-secondary transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  </header>
);

export const SettingsActionBar: React.FC<{
  isSaving: boolean;
  disabled: boolean;
  translate: Translate;
  onCancel: () => void;
}> = ({ isSaving, disabled, translate, onCancel }) => (
  <div className="hidden shrink-0 items-center gap-2 md:flex">
    <button
      type="button"
      onClick={onCancel}
      className="h-9 border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised"
    >
      {translate('cancel')}
    </button>
    <button
      type="submit"
      form="settings-center-form"
      disabled={disabled}
      className="h-9 bg-foreground px-4 text-xs font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSaving ? translate('saving') : translate('save')}
    </button>
  </div>
);

export const SettingsMobileActionBar: React.FC<{
  isSaving: boolean;
  disabled: boolean;
  translate: Translate;
  onCancel: () => void;
}> = ({ isSaving, disabled, translate, onCancel }) => (
  <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-background px-4 py-3 md:hidden">
    <button
      type="button"
      onClick={onCancel}
      className="h-9 border border-border px-4 text-sm font-medium text-foreground"
    >
      {translate('cancel')}
    </button>
    <button
      type="submit"
      form="settings-center-form"
      disabled={disabled}
      className="h-9 bg-foreground px-4 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSaving ? translate('saving') : translate('save')}
    </button>
  </div>
);

export const SettingsHome: React.FC<{
  modules: readonly VisibleSettingsModule[];
  translate: Translate;
  onOpenModule: (tabId: SettingsTabId) => void;
}> = ({ modules, translate, onOpenModule }) => (
  <div className="mx-auto w-full max-w-[1120px] px-4 py-9 sm:px-6 sm:py-10">
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
        {translate('settingsCenterHome')}
      </p>
      <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {translate('settingsCenterHomeTitle')}
      </h2>
      <p className="mt-2.5 text-sm leading-6 text-secondary">
        {translate('settingsCenterHomeDescription')}
      </p>
    </div>
    <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
      {modules.map((module) => (
        <button
          key={module.id}
          type="button"
          onClick={() => onOpenModule(module.tabs[0].id)}
          aria-label={`${translate('settingsCenterEnterModule')}: ${translate(module.labelKey)}`}
          data-settings-module-card={module.id}
          className="group grid min-h-[152px] grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-4 rounded-[14px] border border-border-subtle bg-surface/70 p-5 text-left transition-[transform,border-color,background-color] duration-150 hover:-translate-y-px hover:border-foreground/25 hover:bg-surface-raised/45 active:translate-y-0 focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transform-none motion-reduce:transition-colors sm:p-6"
        >
          <span className="pt-0.5 font-mono text-xs text-secondary">{module.index}</span>
          <span className="flex min-w-0 flex-col self-stretch">
            <span className="block text-lg font-semibold tracking-tight text-foreground">
              {translate(module.labelKey)}
            </span>
            <span className="mt-2 block text-sm leading-6 text-secondary">
              {translate(module.descriptionKey)}
            </span>
            <span className="mt-auto block pt-3 text-xs font-medium text-secondary">
              {module.tabs.length} {translate('settingsCenterItemUnit')}
            </span>
          </span>
          <span
            data-settings-enter-icon="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised text-secondary transition-[transform,background-color,color] duration-150 group-hover:translate-x-0.5 group-hover:bg-foreground group-hover:text-background motion-reduce:transform-none motion-reduce:transition-colors"
            aria-hidden="true"
          >
            <ArrowRightIcon className="h-4 w-4" />
          </span>
        </button>
      ))}
    </div>
  </div>
);

export const SettingsModuleHeader: React.FC<{
  module: VisibleSettingsModule;
  activeTab: SettingsTabId;
  translate: Translate;
  onBack: () => void;
  onTabChange: (tabId: SettingsTabId) => void;
}> = ({ module, activeTab, translate, onBack, onTabChange }) => {
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = tabIndex;
    if (event.key === 'ArrowLeft') nextIndex = (tabIndex - 1 + module.tabs.length) % module.tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (tabIndex + 1) % module.tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = module.tabs.length - 1;
    const nextTab = module.tabs[nextIndex];
    onTabChange(nextTab.id);
    requestAnimationFrame(() => {
      document.getElementById(`settings-module-tab-${nextTab.id}`)?.focus();
    });
  };

  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto w-full max-w-[1120px] px-4 pt-7 sm:px-6 sm:pt-9">
        <nav className="flex items-center gap-2 text-xs text-secondary" aria-label={translate('settingsCenterTitle')}>
          <button type="button" onClick={onBack} className="hover:text-foreground hover:underline">
            {translate('settingsCenterTitle')}
          </button>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{translate(module.labelKey)}</span>
        </nav>
        <div className="mt-4 max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {translate(module.labelKey)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-secondary">{translate(module.descriptionKey)}</p>
        </div>
        <div
          role="tablist"
          aria-label={translate(module.labelKey)}
          className="mt-6 flex min-w-0 gap-7 overflow-x-auto [scrollbar-width:thin]"
        >
          {module.tabs.map((tab, tabIndex) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                id={`settings-module-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="settings-center-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tabIndex)}
                className={`shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  selected
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-secondary hover:text-foreground'
                }`}
              >
                {translate(tab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const SettingsSection: React.FC<{
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}> = ({ title, description, children, footer }) => (
  <section className="grid gap-5 border-t border-border py-7 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:gap-10 lg:py-9">
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-2 text-xs leading-5 text-secondary">{description}</p>}
    </div>
    <div className="min-w-0">
      <div className="divide-y divide-border">{children}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  </section>
);

export const SettingsField: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className="py-4 first:pt-0 last:pb-0">{children}</div>
);

export const SettingsStatus: React.FC<{
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}> = ({ tone = 'neutral', children }) => {
  const toneClass = {
    neutral: 'border-border text-secondary',
    success: 'border-green-600/40 text-green-700 dark:text-green-400',
    warning: 'border-amber-600/50 text-amber-800 dark:text-amber-300',
    danger: 'border-red-600/50 text-red-700 dark:text-red-400',
  }[tone];
  return <div className={`border-l-2 py-1 pl-3 text-sm leading-6 ${toneClass}`}>{children}</div>;
};
