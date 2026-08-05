import React, { useEffect, useRef, useState } from 'react';

import { normalizeFontPreference } from '../../config';
import { i18nService } from '../../services/i18n';
import { formatShortcutForDisplay } from '../../services/shortcuts';
import EditIcon from '../icons/EditIcon';
import { SettingsField, SettingsSection } from './SettingsCenterLayout';

export const isMacPlatform = navigator.platform.includes('Mac');

const isSystemShortcut = (event: KeyboardEvent): boolean => {
  const key = event.key.toLowerCase();
  if (event.metaKey && ['c', 'v', 'x', 'z', 'y', 'a', 'q', 'w'].includes(key)) return true;
  if (event.metaKey && event.shiftKey && key === 'z') return true;
  return event.ctrlKey && ['c', 'v', 'x', 'z', 'y', 'a', 'w'].includes(key);
};

const formatShortcutFromEvent = (event: React.KeyboardEvent): string | null => {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return null;
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return null;
  if (isSystemShortcut(event.nativeEvent)) return null;

  const parts: string[] = [];
  if (event.metaKey) parts.push('Cmd');
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push(isMacPlatform ? 'Option' : 'Alt');
  if (event.shiftKey) parts.push('Shift');

  const keyMap: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ' ': 'Space',
    Escape: 'Esc',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
  };
  const key = keyMap[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  parts.push(key);
  return parts.join('+');
};

const SEND_SHORTCUT_OPTIONS = [
  { value: 'Enter', label: 'Enter', labelMac: 'Enter' },
  { value: 'Shift+Enter', label: 'Shift+Enter', labelMac: 'Shift+Enter' },
  { value: 'Ctrl+Enter', label: 'Ctrl+Enter', labelMac: 'Cmd+Enter' },
  { value: 'Alt+Enter', label: 'Alt+Enter', labelMac: 'Option+Enter' },
] as const;

export const ShortcutRecorder: React.FC<{
  value: string;
  label: string;
  onChange: (value: string) => void;
}> = ({ value, label, onChange }) => {
  const [recording, setRecording] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<HTMLButtonElement>(null);
  const displayValue = formatShortcutForDisplay(value, { isMac: isMacPlatform });
  const editLabel = i18nService.t('shortcutEditCommand').replace('{command}', label);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      onChange('');
      setRecording(false);
      return;
    }
    const shortcut = formatShortcutFromEvent(event);
    if (shortcut) {
      onChange(shortcut);
      setRecording(false);
    }
  };

  useEffect(() => {
    if (!recording) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setRecording(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [recording]);

  useEffect(() => {
    if (recording) window.setTimeout(() => recorderRef.current?.focus(), 0);
  }, [recording]);

  if (recording) {
    return (
      <div ref={containerRef} className="flex items-center gap-3">
        <button
          ref={recorderRef}
          type="button"
          data-shortcut-input="true"
          onKeyDown={handleKeyDown}
          className="h-8 min-w-[8rem] rounded-xl border border-border bg-surface px-4 text-xs font-medium text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/25"
        >
          {i18nService.t('shortcutPressShortcut')}
        </button>
        <button
          type="button"
          data-shortcut-input="true"
          onClick={() => setRecording(false)}
          className="text-xs font-medium text-secondary transition-colors hover:text-foreground"
        >
          {i18nService.t('cancel')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        title={displayValue || i18nService.t('shortcutNotSet')}
        className="min-w-[5.5rem] max-w-[9rem] truncate rounded-full bg-surface-raised px-3 py-1 text-center text-xs font-medium text-secondary"
      >
        {displayValue || i18nService.t('shortcutNotSet')}
      </span>
      <button
        type="button"
        onClick={() => setRecording(true)}
        title={editLabel}
        aria-label={editLabel}
        className="pointer-events-none inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-secondary opacity-0 transition-colors hover:bg-surface-raised hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        <EditIcon className="h-4 w-4" />
      </button>
    </div>
  );
};

export const SendShortcutSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const option = SEND_SHORTCUT_OPTIONS.find((item) => item.value === value);
  const currentLabel = !value
    ? i18nService.t('shortcutNotSet')
    : option
      ? (isMacPlatform ? option.labelMac : option.label)
      : formatShortcutForDisplay(value, { isMac: isMacPlatform });

  return (
    <div ref={containerRef} className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          data-shortcut-input="true"
          onClick={() => setOpen((current) => !current)}
          className={`w-28 cursor-pointer select-none rounded-lg border px-2.5 py-1 text-center text-xs outline-none transition-colors dark:bg-claude-darkSurfaceInset bg-claude-surfaceInset dark:text-claude-darkText text-claude-text ${
            open
              ? 'border-claude-accent ring-1 ring-claude-accent/30'
              : 'dark:border-claude-darkBorder border-claude-border hover:border-claude-accent/50'
          }`}
        >
          {currentLabel}
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-1 min-w-[160px] rounded-xl border border-claude-border bg-claude-surfaceInset py-1 shadow-elevated dark:border-claude-darkBorder dark:bg-claude-darkSurfaceInset">
            {SEND_SHORTCUT_OPTIONS.map((item) => {
              const itemLabel = isMacPlatform ? item.labelMac : item.label;
              const isActive = value === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-claude-accent/10 ${
                    isActive
                      ? 'font-medium text-claude-accent dark:text-claude-accent'
                      : 'text-claude-text dark:text-claude-darkText'
                  }`}
                >
                  <span>{itemLabel}</span>
                  {isActive && <span className="text-claude-accent">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <span className="h-6 w-6 shrink-0" aria-hidden="true" />
    </div>
  );
};

export const SettingsSwitch: React.FC<{
  checked: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}> = ({ checked, label, disabled, onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => void onClick()}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
      disabled ? 'cursor-not-allowed opacity-50' : ''
    } ${checked ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export const SettingsToggleRow: React.FC<{
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void | Promise<void>;
}> = ({ title, description, checked, disabled, onToggle }) => (
  <div>
    <div className="flex items-center justify-between gap-4">
      <h4 className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</h4>
      <SettingsSwitch checked={checked} label={title} disabled={disabled} onClick={onToggle} />
    </div>
    <p className="mt-1 text-sm text-secondary">{description}</p>
  </div>
);

export const SettingsGroup: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, description, children, footer }) => (
  <SettingsSection title={title} description={description} footer={footer}>
    {children}
  </SettingsSection>
);

export const SettingsRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SettingsField>{children}</SettingsField>
);

export const SettingsNumberInputRow: React.FC<{
  id: string;
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ id, title, description, value, min, max, onChange }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {title}
      </label>
      <p className="mt-1 text-sm text-secondary">{description}</p>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(normalizeFontPreference(event.currentTarget.value, value, min, max))}
        onBlur={(event) => onChange(normalizeFontPreference(event.currentTarget.value, value, min, max))}
        className="h-8 w-16 rounded-lg border border-border bg-surface px-2 text-center text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <span className="text-sm text-secondary">px</span>
    </div>
  </div>
);
