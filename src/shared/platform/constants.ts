/**
 * IM Platform Constants — Single Source of Truth
 *
 * All IM platform identifiers, channel mappings, region groups, and UI metadata
 * are defined here as a unified registry. Both main and renderer processes
 * import from this module.
 *
 * When adding a new IM platform:
 * 1. Add one record to the DEFINITIONS array below
 *    — that's it, types and lookups are derived automatically.
 */

// ═══════════════════════════════════════════════════════
// 1. Definition Shape (for `as const satisfies` constraint)
// ═══════════════════════════════════════════════════════

interface PlatformDefInput {
  readonly id: string;
  readonly label: string;
  readonly region: 'china' | 'global';
  readonly channel: string;
  readonly channelAliases: readonly string[];
  readonly logo: string;
  readonly guideUrl: string;
}

// ═══════════════════════════════════════════════════════
// 2. Platform Definitions — the single source of truth
//    Array order = Chinese UI display order (CHINA first, then GLOBAL).
// ═══════════════════════════════════════════════════════

const DEFINITIONS = [
  // ── China ──
  {
    id: 'weixin',
    label: 'WeChat',
    region: 'china',
    channel: 'openclaw-weixin',
    channelAliases: [],
    logo: 'weixin.png',
    guideUrl: '',
  },
  {
    id: 'dingtalk',
    label: 'DingTalk',
    region: 'china',
    channel: 'dingtalk-connector',
    channelAliases: ['dingtalk'],
    logo: 'dingding.png',
    guideUrl: '',
  },
  {
    id: 'feishu',
    label: 'Feishu',
    region: 'china',
    channel: 'feishu',
    channelAliases: [],
    logo: 'feishu.png',
    guideUrl: '',
  },
  {
    id: 'wecom',
    label: 'WeCom',
    region: 'china',
    channel: 'wecom',
    channelAliases: ['wecom-openclaw-plugin'],
    logo: 'wecom.png',
    guideUrl: '',
  },
  {
    id: 'qq',
    label: 'QQ',
    region: 'china',
    channel: 'qqbot',
    channelAliases: [],
    logo: 'qq_bot.jpeg',
    guideUrl: '',
  },
] as const satisfies readonly PlatformDefInput[];

const RETIRED_CHANNELS = new Set([
  'nim',
  'netease-bee',
  'popo',
  'moltbot-popo',
  'telegram',
  'discord',
  'email',
  'clawemail',
  'clawemail-email',
]);

// ═══════════════════════════════════════════════════════
// 3. Derived Types
// ═══════════════════════════════════════════════════════

export type ActivePlatform = (typeof DEFINITIONS)[number]['id'];
/**
 * Persisted platform identifiers from releases that exposed additional
 * message channels. They remain readable so existing rows and scheduled-task
 * history are not destroyed, but they are intentionally absent from the
 * active registry and can no longer be started or selected.
 */
export type LegacyPlatform =
  | 'nim'
  | 'netease-bee'
  | 'popo'
  | 'telegram'
  | 'discord'
  | 'email';
export type Platform = ActivePlatform | LegacyPlatform;
export type ChannelName =
  | (typeof DEFINITIONS)[number]['channel']
  | (typeof DEFINITIONS)[number]['channelAliases'][number];

// ═══════════════════════════════════════════════════════
// 4. Platform Definition Interface (public)
// ═══════════════════════════════════════════════════════

export interface PlatformDef {
  /** Internal platform identifier */
  readonly id: ActivePlatform;
  /** UI display name (for non-i18n contexts like scheduled task dropdowns) */
  readonly label: string;
  /** Region grouping */
  readonly region: 'china' | 'global';
  /** Primary OpenClaw channel */
  readonly channel: ChannelName;
  /** Additional channel aliases (e.g. wecom has both 'wecom' and 'wecom-openclaw-plugin') */
  readonly channelAliases: readonly ChannelName[];
  /** Logo filename relative to /im-logos/ in public assets */
  readonly logo: string;
  /** Setup guide URL (empty string if not yet available) */
  readonly guideUrl: string;
}

// ═══════════════════════════════════════════════════════
// 5. Registry Implementation
// ═══════════════════════════════════════════════════════

class PlatformRegistryImpl {
  private readonly defs: readonly PlatformDef[];
  private readonly platformIndex: ReadonlyMap<ActivePlatform, PlatformDef>;
  private readonly channelIndex: ReadonlyMap<string, PlatformDef>;
  private readonly _platforms: readonly ActivePlatform[];
  private readonly _channelSet: ReadonlySet<string>;

  constructor(definitions: readonly PlatformDef[]) {
    this.defs = definitions;

    const pIdx = new Map<ActivePlatform, PlatformDef>();
    const cIdx = new Map<string, PlatformDef>();
    const platforms: ActivePlatform[] = [];
    const channels = new Set<string>();

    for (const def of definitions) {
      pIdx.set(def.id, def);
      platforms.push(def.id);

      cIdx.set(def.channel, def);
      channels.add(def.channel);

      for (const alias of def.channelAliases) {
        cIdx.set(alias, def);
        channels.add(alias);
      }
    }

    this.platformIndex = pIdx;
    this.channelIndex = cIdx;
    this._platforms = platforms;
    this._channelSet = channels;
  }

  // ── Platform Lists ──

  /** All platform ids. Array order = UI display order. */
  get platforms(): readonly ActivePlatform[] {
    return this._platforms;
  }

  /** Platforms filtered by region, preserving definition order. */
  platformsByRegion(region: 'china' | 'global'): readonly ActivePlatform[] {
    return this.defs.filter(d => d.region === region).map(d => d.id);
  }

  // ── Single Platform Queries ──

  /** Get the full definition for a platform. */
  get(platform: Platform): PlatformDef {
    return this.platformIndex.get(platform as ActivePlatform)!;
  }

  /** Logo filename relative to /im-logos/. */
  logo(platform: Platform): string {
    return this.platformIndex.get(platform as ActivePlatform)!.logo;
  }

  /** Setup guide URL (empty string if not available). */
  guideUrl(platform: Platform): string {
    return this.platformIndex.get(platform as ActivePlatform)!.guideUrl;
  }

  /** Primary OpenClaw channel for a platform. */
  channelOf(platform: Platform): ChannelName {
    return this.platformIndex.get(platform as ActivePlatform)!.channel;
  }

  // ── Channel Queries ──

  /** Resolve a channel string to its platform. Returns undefined for unknown channels. */
  platformOfChannel(channel: string): ActivePlatform | undefined {
    return this.channelIndex.get(channel)?.id;
  }

  /** Check if a string is a known IM channel. */
  isIMChannel(channel: string): boolean {
    return this._channelSet.has(channel);
  }

  isActivePlatform(platform: string): platform is ActivePlatform {
    return this.platformIndex.has(platform as ActivePlatform);
  }

  /** Retired channel ids remain recognizable only to disable legacy data safely. */
  isRetiredIMChannel(channel: string): boolean {
    return RETIRED_CHANNELS.has(channel);
  }

  // ── UI Helpers ──

  /** Channel options for scheduled task delivery target dropdown. */
  channelOptions(): readonly { value: ChannelName; label: string }[] {
    return this.defs.map(d => ({ value: d.channel, label: d.label }));
  }
}

export const PlatformRegistry = new PlatformRegistryImpl(DEFINITIONS);
