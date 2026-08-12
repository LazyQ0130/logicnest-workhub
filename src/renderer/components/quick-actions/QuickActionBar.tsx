import React from 'react';

import type { LocalizedQuickAction } from '../../types/quickAction';
import AcademicCapIcon from '../icons/AcademicCapIcon';
import ChartBarIcon from '../icons/ChartBarIcon';
import DevicePhoneMobileIcon from '../icons/DevicePhoneMobileIcon';
import DocumentTextIcon from '../icons/DocumentTextIcon';
import GlobeAltIcon from '../icons/GlobeAltIcon';
import PresentationChartBarIcon from '../icons/PresentationChartBarIcon';

interface QuickActionBarProps {
  actions: LocalizedQuickAction[];
  selectedActionId?: string | null;
  onActionSelect: (actionId: string) => void;
}

// 图标映射
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  PresentationChartBarIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  DocumentTextIcon,
  ChartBarIcon,
  AcademicCapIcon,
};

const QuickActionBar: React.FC<QuickActionBarProps> = ({ actions, selectedActionId, onActionSelect }) => {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {actions.map((action) => {
        const IconComponent = iconMap[action.icon];
        const isSelected = action.id === selectedActionId;

        return (
          <button
            key={action.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onActionSelect(action.id)}
            className={`group flex min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[length:var(--lobster-text-sidebarCompact)] font-medium leading-5 transition-all duration-150 active:scale-[0.98] ${
              isSelected
                ? 'border-foreground/20 bg-foreground text-background shadow-subtle'
                : 'border-border-subtle bg-surface text-secondary hover:-translate-y-px hover:border-foreground/20 hover:bg-surface-raised hover:text-foreground hover:shadow-subtle'
            }`}
          >
            {IconComponent && (
              <IconComponent
                className={`h-3.5 w-3.5 transition-colors duration-200 ${
                  isSelected ? 'text-background' : 'text-secondary group-hover:text-foreground'
                }`}
              />
            )}
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActionBar;
