import brandConfig from '../../../config/brand.json';

export interface BrandConfig {
  nameZh: string;
  nameEn: string;
  displayName: string;
  version: string;
  slug: string;
  appId: string;
  scheme: string;
  executableName: string;
  userDataDirectory: string;
  databaseFilename: string;
  mainAgentNameZh: string;
  mainAgentNameEn: string;
  exportFormatType: string;
  contact: {
    email: string | null;
  };
  copyright: {
    holderZh: string;
    holderEn: string;
  };
  documents: {
    userGuide: {
      labelZh: string;
      labelEn: string;
      document: string;
    };
    security: {
      labelZh: string;
      labelEn: string;
      document: string;
    };
    serviceTerms: null | {
      labelZh: string;
      labelEn: string;
      document: string;
    };
  };
  colors: {
    navy: string;
    navyRaised: string;
    cyan: string;
    cyanStrong: string;
    gold: string;
  };
  features: {
    analytics: boolean;
    officialUpdates: boolean;
    remoteExpertKits: boolean;
    unauditedImChannels: boolean;
  };
  appearance: {
    visibleThemeIds: string[];
  };
  assets: {
    sourceLogo: string;
    rendererLogo: string;
    windowsIcon: string;
    trayIcon: string;
  };
}

export const BRAND = brandConfig satisfies BrandConfig;
export const APP_NAME = BRAND.displayName;
export const APP_ID = BRAND.slug;
export const APP_USER_MODEL_ID = BRAND.appId;
export const APP_SCHEME = BRAND.scheme;
export const APP_PROTOCOL_PREFIX = `${APP_SCHEME}://`;
export const DB_FILENAME = BRAND.databaseFilename;
export const DEFAULT_PROJECT_DIRECTORY = BRAND.slug;
