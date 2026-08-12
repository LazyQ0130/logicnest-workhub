import { LocalizedText, LocalSkillInfo, MarketplaceSkill, MarketTag, Skill } from '../types/skill';
import { i18nService } from './i18n';
import { LogReporterAction, reportYdAnalyzer } from './logReporter';

// Chinese presentation fallback for built-in capabilities. Raw SKILL.md text is
// intentionally kept separate so routing prompts continue to use the original contract.
export const BUILTIN_SKILL_DISPLAY_ZH: Record<string, { displayNameZh: string; displayDescriptionZh: string }> = {
  'article-writer': { displayNameZh: '文章写作', displayDescriptionZh: '撰写结构完整、适合目标读者的中文或英文文章。' },
  'canvas-design': { displayNameZh: '平面设计', displayDescriptionZh: '制作海报、视觉作品和可导出的静态设计。' },
  'content-planner': { displayNameZh: '内容策划', displayDescriptionZh: '规划内容主题、栏目、发布节奏和选题清单。' },
  'create-plan': { displayNameZh: '计划制定', displayDescriptionZh: '把复杂目标拆解成清晰、可执行的步骤和检查项。' },
  'daily-trending': { displayNameZh: '每日热点', displayDescriptionZh: '整理当天热点信息并提炼值得关注的主题。' },
  'develop-web-game': { displayNameZh: '网页游戏开发', displayDescriptionZh: '创建和调试可在浏览器运行的交互式游戏。' },
  docx: { displayNameZh: 'Word 文档', displayDescriptionZh: '创建、编辑和检查 Word 文档内容与版式。' },
  'films-search': { displayNameZh: '影视搜索', displayDescriptionZh: '查询影片和剧集信息，整理推荐与观看参考。' },
  'frontend-design': { displayNameZh: '前端设计', displayDescriptionZh: '设计并实现完整、精致的网页界面和交互组件。' },
  'imap-smtp-email': { displayNameZh: '邮件收发', displayDescriptionZh: '通过 IMAP 和 SMTP 查询、整理和发送电子邮件。' },
  'local-tools': { displayNameZh: '本地工具', displayDescriptionZh: '调用本地实用工具完成文件和系统辅助任务。' },
  'music-search': { displayNameZh: '音乐搜索', displayDescriptionZh: '查询歌曲、专辑和音乐相关资料。' },
  pdf: { displayNameZh: 'PDF 文档', displayDescriptionZh: '读取、创建、检查和处理 PDF 文件。' },
  playwright: { displayNameZh: '浏览器自动化', displayDescriptionZh: '自动操作网页并验证页面状态和交互。' },
  pptx: { displayNameZh: '演示文稿', displayDescriptionZh: '创建、编辑和检查 PowerPoint 演示文稿。' },
  remotion: { displayNameZh: '程序化视频', displayDescriptionZh: '使用代码制作可渲染的视频内容。' },
  seedance: { displayNameZh: '视频生成', displayDescriptionZh: '根据文字或参考素材生成视频。' },
  seedream: { displayNameZh: '图片生成', displayDescriptionZh: '根据文字或参考图片生成视觉素材。' },
  'skill-creator': { displayNameZh: '能力创建', displayDescriptionZh: '创建和完善可复用的 Agent 能力包。' },
  'skill-vetter': { displayNameZh: '能力审查', displayDescriptionZh: '检查能力包的安全性、结构和可用性。' },
  'stock-analyzer': { displayNameZh: '股票分析', displayDescriptionZh: '整理行情与指标并输出结构化分析。' },
  'stock-announcements': { displayNameZh: '股票公告', displayDescriptionZh: '查询和归纳上市公司公告。' },
  'stock-explorer': { displayNameZh: '股票查询', displayDescriptionZh: '查找股票基础资料、行情和相关信息。' },
  'technology-news-search': { displayNameZh: '科技资讯', displayDescriptionZh: '检索并整理科技、人工智能和产品资讯。' },
  weather: { displayNameZh: '天气查询', displayDescriptionZh: '查询天气实况和预报。' },
  'web-search': { displayNameZh: '网页搜索', displayDescriptionZh: '搜索互联网并整理可靠来源。' },
  xlsx: { displayNameZh: '电子表格', displayDescriptionZh: '创建、编辑、分析和检查电子表格。' },
  youdaonote: { displayNameZh: '云笔记兼容', displayDescriptionZh: '读取和整理兼容云笔记格式的内容。' },
};

export function resolveLocalizedText(text: string | LocalizedText): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  const lang = i18nService.getLanguage();
  return text[lang] || text.en || '';
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(s => parseInt(s, 10) || 0);
  const pb = b.split('.').map(s => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/** Legacy SKILL.md files may omit version; keep that value incomparable. */
export function isComparableVersion(version: unknown): version is string {
  return typeof version === 'string'
    && /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,2}(?:[-+][0-9A-Za-z.-]+)?$/.test(version.trim());
}

export function isSkillUpdateAvailable(marketVersion: unknown, installedVersion: unknown): boolean {
  if (!isComparableVersion(marketVersion) || !isComparableVersion(installedVersion)) return false;
  return compareVersions(marketVersion.trim(), installedVersion.trim()) > 0;
}

function getSkillAnalyticsSource(skill: Skill): string {
  if (skill.isBuiltIn) return 'built_in';
  if (skill.isOfficial) return 'official';
  return 'custom';
}

type EmailConnectivityCheck = {
  code: 'imap_connection' | 'smtp_connection';
  level: 'pass' | 'fail';
  message: string;
  durationMs: number;
};

type EmailConnectivityTestResult = {
  testedAt: number;
  verdict: 'pass' | 'fail';
  checks: EmailConnectivityCheck[];
};

export type EmailSkillAccountConfig = {
  id: string;
  name: string;
  enabled: boolean;
  provider?: string;
  email: string;
  password?: string;
  imapHost?: string;
  imapPort?: number;
  imapTls?: boolean;
  imapRejectUnauthorized?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpRejectUnauthorized?: boolean;
  smtpFrom?: string;
  mailbox?: string;
  requireSendConfirmation?: boolean;
};

export type EmailSkillAccountsConfig = {
  version: 1;
  defaultAccountId: string;
  accounts: EmailSkillAccountConfig[];
};

class SkillService {
  private skills: Skill[] = [];
  private initialized = false;
  private localSkillDescriptions: Map<string, string | LocalizedText> = new Map();
  private marketplaceSkillDescriptions: Map<string, string | LocalizedText> = new Map();
  private installedKitSkillDescriptions: Map<string, string | LocalizedText> = new Map();
  private marketplaceCache: { skills: MarketplaceSkill[]; tags: MarketTag[] } | null = null;
  private marketplaceFetchPromise: Promise<{ skills: MarketplaceSkill[]; tags: MarketTag[] }> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.loadSkills();
    this.initialized = true;
  }

  async loadSkills(): Promise<Skill[]> {
    try {
      const result = await window.electron.skills.list();
      if (result.success && result.skills) {
        this.skills = result.skills;
      } else {
        this.skills = [];
      }
      await this.loadInstalledKitSkillDescriptions();
      return this.skills;
    } catch (error) {
      console.error('Failed to load skills:', error);
      this.skills = [];
      return this.skills;
    }
  }

  async setSkillEnabled(id: string, enabled: boolean): Promise<Skill[]> {
    try {
      const previousSkill = this.skills.find(skill => skill.id === id);
      const result = await window.electron.skills.setEnabled({ id, enabled });
      if (result.success && result.skills) {
        this.skills = result.skills;
        const updatedSkill = this.skills.find(skill => skill.id === id) ?? previousSkill;
        if (enabled && previousSkill?.enabled !== true && updatedSkill) {
          void reportYdAnalyzer({
            action: LogReporterAction.SkillEnabled,
            skillId: updatedSkill.id,
            skillName: updatedSkill.name,
            skillSource: getSkillAnalyticsSource(updatedSkill),
            isBuiltIn: updatedSkill.isBuiltIn,
            isOfficial: updatedSkill.isOfficial,
            version: updatedSkill.version,
          });
        }
        return this.skills;
      }
      throw new Error(result.error || 'Failed to update skill');
    } catch (error) {
      console.error('Failed to update skill:', error);
      throw error;
    }
  }

  async deleteSkill(id: string): Promise<{ success: boolean; skills?: Skill[]; error?: string }> {
    try {
      const result = await window.electron.skills.delete(id);
      if (result.success && result.skills) {
        this.skills = result.skills;
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete skill';
      console.error('Failed to delete skill:', error);
      return { success: false, error: message };
    }
  }

  async downloadSkill(source: string): Promise<{
    success: boolean;
    skills?: Skill[];
    error?: string;
    auditReport?: any;
    pendingInstallId?: string;
  }> {
    try {
      const result = await window.electron.skills.download(source);
      if (result.success && result.skills) {
        this.skills = result.skills;
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download skill';
      console.error('Failed to download skill:', error);
      return { success: false, error: message };
    }
  }

  async confirmInstall(
    pendingId: string,
    action: string
  ): Promise<{ success: boolean; skills?: Skill[]; error?: string }> {
    try {
      const result = await window.electron.skills.confirmInstall(pendingId, action);
      if (result.success && result.skills) {
        this.skills = result.skills;
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm install';
      console.error('Failed to confirm install:', error);
      return { success: false, error: message };
    }
  }

  async upgradeSkill(skillId: string, downloadUrl: string): Promise<{
    success: boolean;
    skills?: Skill[];
    error?: string;
    auditReport?: any;
    pendingInstallId?: string;
  }> {
    try {
      const result = await window.electron.skills.upgrade(skillId, downloadUrl);
      if (result.success && result.skills) {
        this.skills = result.skills;
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upgrade skill';
      console.error('Failed to upgrade skill:', error);
      return { success: false, error: message };
    }
  }

  async getSkillsRoot(): Promise<string | null> {
    try {
      const result = await window.electron.skills.getRoot();
      if (result.success && result.path) {
        return result.path;
      }
      return null;
    } catch (error) {
      console.error('Failed to get skills root:', error);
      return null;
    }
  }

  onSkillsChanged(callback: () => void): () => void {
    return window.electron.skills.onChanged(callback);
  }

  getSkills(): Skill[] {
    return this.skills;
  }

  getEnabledSkills(): Skill[] {
    return this.skills.filter(s => s.enabled);
  }

  getSkillById(id: string): Skill | undefined {
    return this.skills.find(s => s.id === id);
  }

  async getSkillConfig(skillId: string): Promise<Record<string, string>> {
    try {
      const result = await window.electron.skills.getConfig(skillId);
      if (result.success && result.config) {
        return result.config;
      }
      return {};
    } catch (error) {
      console.error('Failed to get skill config:', error);
      return {};
    }
  }

  async setSkillConfig(skillId: string, config: Record<string, string>): Promise<boolean> {
    try {
      const result = await window.electron.skills.setConfig(skillId, config);
      return result.success;
    } catch (error) {
      console.error('Failed to set skill config:', error);
      return false;
    }
  }

  async testEmailConnectivity(
    skillId: string,
    config: Record<string, string>
  ): Promise<EmailConnectivityTestResult | null> {
    try {
      const result = await window.electron.skills.testEmailConnectivity(skillId, config);
      if (result.success && result.result) {
        return result.result;
      }
      return null;
    } catch (error) {
      console.error('Failed to test email connectivity:', error);
      return null;
    }
  }

  async getEmailAccountsConfig(skillId: string): Promise<EmailSkillAccountsConfig> {
    try {
      console.debug('[EmailSkill] loading email accounts config', { skillId });
      const result = await window.electron.skills.getEmailAccountsConfig(skillId);
      if (result.success && result.config) {
        console.debug('[EmailSkill] loaded email accounts config', {
          skillId,
          accountCount: result.config.accounts.length,
          enabledAccountCount: result.config.accounts.filter(account => account.enabled).length,
          defaultAccountId: result.config.defaultAccountId,
        });
        return result.config;
      }
      console.warn('[EmailSkill] failed to load email accounts config', { skillId, error: result.error });
      return { version: 1, defaultAccountId: '', accounts: [] };
    } catch (error) {
      console.error('Failed to get email accounts config:', error);
      return { version: 1, defaultAccountId: '', accounts: [] };
    }
  }

  async setEmailAccountsConfig(
    skillId: string,
    config: EmailSkillAccountsConfig,
  ): Promise<boolean> {
    try {
      console.debug('[EmailSkill] saving email accounts config', {
        skillId,
        accountCount: config.accounts.length,
        enabledAccountCount: config.accounts.filter(account => account.enabled).length,
        defaultAccountId: config.defaultAccountId,
      });
      const result = await window.electron.skills.setEmailAccountsConfig(skillId, config);
      if (!result.success) {
        console.warn('[EmailSkill] failed to save email accounts config', { skillId, error: result.error });
      }
      return result.success;
    } catch (error) {
      console.error('Failed to set email accounts config:', error);
      return false;
    }
  }

  async testEmailAccountConnectivity(
    skillId: string,
    account: EmailSkillAccountConfig,
  ): Promise<EmailConnectivityTestResult | null> {
    try {
      console.debug('[EmailSkill] testing email account connectivity', {
        skillId,
        accountId: account.id,
        hasEmail: Boolean(account.email),
        hasPassword: Boolean(account.password),
        hasImapHost: Boolean(account.imapHost),
        hasSmtpHost: Boolean(account.smtpHost),
      });
      const result = await window.electron.skills.testEmailAccountConnectivity(skillId, account);
      if (result.success && result.result) {
        console.debug('[EmailSkill] email account connectivity test completed', {
          skillId,
          accountId: account.id,
          verdict: result.result.verdict,
        });
        return result.result;
      }
      console.warn('[EmailSkill] email account connectivity test failed', {
        skillId,
        accountId: account.id,
        error: result.error,
      });
      return null;
    } catch (error) {
      console.error('Failed to test email account connectivity:', error);
      return null;
    }
  }

  async getAutoRoutingPrompt(): Promise<string | null> {
    try {
      const result = await window.electron.skills.autoRoutingPrompt();
      return result.success ? (result.prompt || null) : null;
    } catch (error) {
      console.error('Failed to get auto-routing prompt:', error);
      return null;
    }
  }
  hasLocalizedSkillDescriptions(): boolean {
    return this.localSkillDescriptions.size > 0
      || this.marketplaceSkillDescriptions.size > 0
      || this.installedKitSkillDescriptions.size > 0;
  }

  async fetchMarketplaceSkills(): Promise<{ skills: MarketplaceSkill[]; tags: MarketTag[] }> {
    if (this.marketplaceCache) {
      return this.marketplaceCache;
    }
    if (this.marketplaceFetchPromise) {
      return this.marketplaceFetchPromise;
    }

    this.marketplaceFetchPromise = this.loadMarketplaceSkills();
    const result = await this.marketplaceFetchPromise;
    this.marketplaceFetchPromise = null;
    return result;
  }

  private async loadMarketplaceSkills(): Promise<{ skills: MarketplaceSkill[]; tags: MarketTag[] }> {
    try {
      const result = await window.electron.skills.fetchMarketplace();
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch');
      }
      const json = JSON.parse(result.data);
      const value = json?.data?.value;
      // Store local skill descriptions for i18n lookup
      const localSkills: LocalSkillInfo[] = Array.isArray(value?.localSkill) ? value.localSkill : [];
      this.localSkillDescriptions.clear();
      for (const ls of localSkills) {
        this.localSkillDescriptions.set(ls.name, ls.description);
        this.localSkillDescriptions.set(ls.id, ls.description);
      }
      const skills: MarketplaceSkill[] = Array.isArray(value?.marketplace) ? value.marketplace : [];
      const tags: MarketTag[] = Array.isArray(value?.marketTags) ? value.marketTags : [];
      // Also store marketplace skill descriptions for i18n lookup (keyed by id)
      this.marketplaceSkillDescriptions.clear();
      for (const ms of skills) {
        if (typeof ms.description === 'object') {
          this.marketplaceSkillDescriptions.set(ms.id, ms.description);
        }
      }
      this.marketplaceCache = { skills, tags };
      return this.marketplaceCache;
    } catch (error) {
      console.error('Failed to fetch marketplace skills:', error);
      return { skills: [], tags: [] };
    }
  }

  private async loadInstalledKitSkillDescriptions(): Promise<void> {
    this.installedKitSkillDescriptions.clear();
    try {
      const result = await window.electron.kits.listInstalled();
      if (!result.success || !result.installed) return;

      for (const kit of Object.values(result.installed)) {
        const metadata = kit.skills?.metadata ?? {};
        for (const [skillId, skillMetadata] of Object.entries(metadata)) {
          if (skillMetadata.description != null) {
            this.installedKitSkillDescriptions.set(skillId, skillMetadata.description);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load installed kit skill descriptions:', error);
    }
  }

  getLocalizedSkillDescription(skillId: string, skillName: string, fallback: string): string {
    const marketDesc = this.marketplaceSkillDescriptions.get(skillId);
    if (marketDesc != null) return resolveLocalizedText(marketDesc);
    const localDesc = this.localSkillDescriptions.get(skillName) ?? this.localSkillDescriptions.get(skillId);
    if (localDesc != null) return resolveLocalizedText(localDesc);
    const kitDesc = this.installedKitSkillDescriptions.get(skillId);
    if (kitDesc != null) return resolveLocalizedText(kitDesc);
    return BUILTIN_SKILL_DISPLAY_ZH[skillId]?.displayDescriptionZh ?? fallback;
  }

  getLocalizedSkillName(skillId: string, fallback: string): string {
    return BUILTIN_SKILL_DISPLAY_ZH[skillId]?.displayNameZh ?? fallback;
  }
}

export const skillService = new SkillService();
