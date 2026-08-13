import { app } from 'electron';

import { HtmlSharePublicRoute } from '../../shared/htmlShare/constants';
import type { SqliteStore } from '../sqliteStore';

let cachedTestMode: boolean | null = null;
const DISABLED_LOCAL_ENDPOINT = 'http://127.0.0.1:1';
const LOCAL_LICENSE_API_ENDPOINT = 'http://127.0.0.1:8787/api/v1';

const configuredLicenseApiEndpoint = (): string => {
  const configured = process.env.LOGICNEST_LICENSE_API_URL?.trim().replace(/\/+$/, '');
  return configured || (app.isPackaged ? DISABLED_LOCAL_ENDPOINT : LOCAL_LICENSE_API_ENDPOINT);
};

/**
 * Read testMode from store and cache it.
 * Call once at startup and again whenever app_config changes.
 */
export function refreshEndpointsTestMode(store: SqliteStore): void {
  const appConfig = store.get<any>('app_config');
  cachedTestMode = appConfig?.app?.testMode === true;
}

/**
 * Whether the app is in test mode.
 * Uses cached value after init; falls back to !app.isPackaged before init.
 */
export const isTestModeEnabled = (): boolean => {
  return cachedTestMode ?? !app.isPackaged;
};

/**
 * Server API base URL — switches based on testMode.
 * Used for auth exchange/refresh, models, proxy, etc.
 */
export const getServerApiBaseUrl = (): string => {
  return configuredLicenseApiEndpoint();
};

export const getHtmlSharePublicBaseUrl = (): string => {
  return `${getServerApiBaseUrl()}${HtmlSharePublicRoute.Root}`;
};

export const getUpdateCheckUrl = (): string => `${configuredLicenseApiEndpoint()}/app-updates/check`;

export const getManualUpdateCheckUrl = (): string => `${configuredLicenseApiEndpoint()}/app-updates/check`;

export const getFallbackDownloadUrl = (): string => `${configuredLicenseApiEndpoint()}/app-updates/unavailable`;

export const getSkillStoreUrl = (): string => `${DISABLED_LOCAL_ENDPOINT}/skill-store-disabled`;

// Portal 页面
const getPortalBase = (): string => DISABLED_LOCAL_ENDPOINT;

export const getPortalTasksUrl = (): string => `${getPortalBase()}/profile/detail?tab=tasks`;

export const getKitStoreUrl = (): string => `${DISABLED_LOCAL_ENDPOINT}/kit-store-disabled`;
