import type { Platform } from '../platform';

export const IMConnectivityVerdict = {
  Pass: 'pass',
  Warn: 'warn',
  Fail: 'fail',
} as const;
export type IMConnectivityVerdict = typeof IMConnectivityVerdict[keyof typeof IMConnectivityVerdict];

export const IMConnectivityCheckLevel = {
  Pass: 'pass',
  Info: 'info',
  Warn: 'warn',
  Fail: 'fail',
} as const;
export type IMConnectivityCheckLevel = typeof IMConnectivityCheckLevel[keyof typeof IMConnectivityCheckLevel];

export const IMConnectivityCheckCode = {
  MissingCredentials: 'missing_credentials',
  UnsupportedTransport: 'unsupported_transport',
  AuthCheck: 'auth_check',
  GatewayRunning: 'gateway_running',
  InboundActivity: 'inbound_activity',
  OutboundActivity: 'outbound_activity',
  PlatformLastError: 'platform_last_error',
  FeishuGroupRequiresMention: 'feishu_group_requires_mention',
  FeishuEventSubscriptionRequired: 'feishu_event_subscription_required',
  DiscordGroupRequiresMention: 'discord_group_requires_mention',
  TelegramPrivacyModeHint: 'telegram_privacy_mode_hint',
  DingTalkBotMembershipHint: 'dingtalk_bot_membership_hint',
  NimP2POnlyHint: 'nim_p2p_only_hint',
  OpenClawGatewayNotRunning: 'openclaw_gateway_not_running',
  QQGuildMentionHint: 'qq_guild_mention_hint',
  QQMentionHint: 'qq_mention_hint',
} as const;
export type IMConnectivityCheckCode = typeof IMConnectivityCheckCode[keyof typeof IMConnectivityCheckCode];

export interface IMConnectivityCheck {
  code: IMConnectivityCheckCode;
  level: IMConnectivityCheckLevel;
  message: string;
  suggestion?: string;
}

export interface IMConnectivityTestResult {
  platform: Platform;
  testedAt: number;
  verdict: IMConnectivityVerdict;
  checks: IMConnectivityCheck[];
}

export interface IMConnectivityTestResponse {
  success: boolean;
  result?: IMConnectivityTestResult;
  error?: string;
}
