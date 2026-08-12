export const UserFacingErrorI18nKey = {
  Certificate: 'userErrorCertificate',
  Dns: 'userErrorDns',
  ConnectionRefused: 'userErrorConnectionRefused',
  Timeout: 'userErrorTimeout',
  Network: 'userErrorNetwork',
  Authentication: 'userErrorAuthentication',
  Permission: 'userErrorPermission',
  RateLimit: 'userErrorRateLimit',
  Balance: 'userErrorBalance',
  ModelMissing: 'userErrorModelMissing',
  InputTooLong: 'userErrorInputTooLong',
  ContentFiltered: 'userErrorContentFiltered',
  RuntimeMissing: 'userErrorRuntimeMissing',
  RuntimeStart: 'userErrorRuntimeStart',
  RuntimeMemory: 'userErrorRuntimeMemory',
  FileMissing: 'userErrorFileMissing',
  FilePermission: 'userErrorFilePermission',
  DiskFull: 'userErrorDiskFull',
  InvalidFormat: 'userErrorInvalidFormat',
  Plugin: 'userErrorPlugin',
  Messaging: 'userErrorMessaging',
  ScheduledTask: 'userErrorScheduledTask',
  Update: 'userErrorUpdate',
  Backup: 'userErrorBackup',
} as const;

const RULES: Array<[RegExp, string]> = [
  [/CERT_|certificate|self[- ]signed|unable to verify|SSL|TLS|证书/i, UserFacingErrorI18nKey.Certificate],
  [/ENOTFOUND|EAI_AGAIN|DNS|name resolution|host not found|域名解析/i, UserFacingErrorI18nKey.Dns],
  [/ECONNREFUSED|connection refused|actively refused|连接被拒绝/i, UserFacingErrorI18nKey.ConnectionRefused],
  [/ETIMEDOUT|timed? out|timeout|超时/i, UserFacingErrorI18nKey.Timeout],
  [/ECONNRESET|ENETUNREACH|EHOSTUNREACH|fetch failed|network error|network request failed|socket hang up|网络/i, UserFacingErrorI18nKey.Network],
  [/invalid.*(?:api[_ -]?key|token)|(?:api[_ -]?key|token).*(?:invalid|expired)|unauthorized|authentication failed|\b401\b|登录.*失效|密钥.*无效/i, UserFacingErrorI18nKey.Authentication],
  [/forbidden|permission denied|access denied|EACCES|EPERM|\b403\b|无权|权限不足/i, UserFacingErrorI18nKey.Permission],
  [/rate.?limit|too many requests|RESOURCE_EXHAUSTED|\b429\b|请求.*频繁/i, UserFacingErrorI18nKey.RateLimit],
  [/insufficient.*(?:balance|quota|credits)|billing|quota exceeded|\b402\b|余额不足|额度.*耗尽/i, UserFacingErrorI18nKey.Balance],
  [/model.*not.*(?:found|exist)|unknown model|模型.*(?:不存在|不可用)/i, UserFacingErrorI18nKey.ModelMissing],
  [/context.*length|input.*too.*long|payload.*too.*large|max[_ -]?tokens|\b413\b|输入.*过长/i, UserFacingErrorI18nKey.InputTooLong],
  [/content.*(?:filter|review)|moderation|DataInspectionFailed|\b451\b|内容.*审核/i, UserFacingErrorI18nKey.ContentFiltered],
  [/runtime.*(?:missing|not found)|OpenClaw.*(?:missing|not installed)|entry.*missing|运行时.*(?:缺失|未安装)/i, UserFacingErrorI18nKey.RuntimeMissing],
  [/heap out of memory|ENOMEM|out of memory|内存不足/i, UserFacingErrorI18nKey.RuntimeMemory],
  [/gateway.*(?:start|launch).*failed|failed to start.*(?:gateway|OpenClaw)|运行时.*启动失败|引擎.*启动失败/i, UserFacingErrorI18nKey.RuntimeStart],
  [/ENOSPC|no space left|disk.*full|磁盘.*(?:已满|空间不足)/i, UserFacingErrorI18nKey.DiskFull],
  [/ENOENT|file.*not found|no such file|文件.*不存在/i, UserFacingErrorI18nKey.FileMissing],
  [/invalid.*(?:json|yaml|format)|parse.*failed|unexpected token|格式.*错误|解析.*失败/i, UserFacingErrorI18nKey.InvalidFormat],
  [/plugin|extension|插件/i, UserFacingErrorI18nKey.Plugin],
  [/DingTalk|Feishu|WeCom|WeChat|Telegram|Discord|NIM|message channel|gateway connectivity|消息渠道|机器人/i, UserFacingErrorI18nKey.Messaging],
  [/scheduled task|cron|定时任务/i, UserFacingErrorI18nKey.ScheduledTask],
  [/update|upgrade|installer|更新|升级/i, UserFacingErrorI18nKey.Update],
  [/backup|restore|migration|备份|恢复|迁移/i, UserFacingErrorI18nKey.Backup],
];

export function classifyUserFacingErrorKey(error: string): string | null {
  for (const [pattern, key] of RULES) {
    if (pattern.test(error)) return key;
  }
  return null;
}

export function rawErrorText(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail', 'reason', 'code']) {
      const value = candidate[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return error === undefined || error === null ? '' : String(error).trim();
}
