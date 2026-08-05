/**
 * 集中管理所有业务 API 端点。
 * 后续新增的业务接口也应在此文件中配置。
 */

import { configService } from './config';

// Upstream hosted product endpoints are not part of LogicNest WorkHub. These
// compatibility functions resolve to a closed local port so accidental legacy
// calls cannot leave the device.
const DISABLED_LOCAL_ENDPOINT = 'http://127.0.0.1:1';

export const isTestModeEnabled = () => {
  return configService.getConfig().app?.testMode === true;
};

// 自动更新
export const getUpdateCheckUrl = () => `${DISABLED_LOCAL_ENDPOINT}/update-disabled`;

// 手动检查更新
export const getManualUpdateCheckUrl = () => `${DISABLED_LOCAL_ENDPOINT}/update-disabled`;

export const getFallbackDownloadUrl = () => `${DISABLED_LOCAL_ENDPOINT}/download-disabled`;

// Skill 商店
export const getSkillStoreUrl = () => `${DISABLED_LOCAL_ENDPOINT}/skill-store-disabled`;

// Kit 商店
export const getKitStoreUrl = () => `${DISABLED_LOCAL_ENDPOINT}/kit-store-disabled`;

// 登录地址
export const getLoginOvermindUrl = () => `${DISABLED_LOCAL_ENDPOINT}/login-disabled`;

// Portal 页面
const getPortalBase = () => DISABLED_LOCAL_ENDPOINT;

export const PortalPricingKeyfrom = {
  HtmlShare: 'html_share',
} as const;

export type PortalPricingKeyfrom =
  (typeof PortalPricingKeyfrom)[keyof typeof PortalPricingKeyfrom];

export const getPortalLoginUrl = () => `${getPortalBase()}/login`;
export const getPortalPricingUrl = (keyfrom?: PortalPricingKeyfrom) => (
  `${getPortalBase()}/pricing${keyfrom ? `?keyfrom=${encodeURIComponent(keyfrom)}` : ''}`
);
export const getPortalProfileUrl = () => `${getPortalBase()}/profile`;
export const getPortalRechargeUrl = () => `${getPortalBase()}/`;
export const getPortalInvitationUrl = () => `${getPortalBase()}/invitation`;
export const getPortalCreditsResetActivityUrl = (campaignCode?: string) => (
  `${getPortalBase()}/profile?activity=credits_reset${campaignCode ? `&campaignCode=${encodeURIComponent(campaignCode)}` : ''}`
);
