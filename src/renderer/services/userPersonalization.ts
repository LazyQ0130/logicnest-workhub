import { localStore } from './store';

export const PersonalizationAvatarKind = {
  Preset: 'preset',
  Custom: 'custom',
} as const;

export type PersonalizationAvatarKind =
  typeof PersonalizationAvatarKind[keyof typeof PersonalizationAvatarKind];

export const UserPersonalizationEvent = {
  Updated: 'user-personalization:updated',
} as const;

export const UserPersonalizationLimits = {
  DisplayName: 32,
  Signature: 80,
  UploadBytes: 10 * 1024 * 1024,
  OutputSize: 256,
} as const;

export type UserPersonalizationAvatar =
  | { kind: typeof PersonalizationAvatarKind.Preset; presetId: string }
  | { kind: typeof PersonalizationAvatarKind.Custom; dataUrl: string };

export interface UserPersonalizationV1 {
  version: 1;
  displayName: string;
  signature: string;
  avatar: UserPersonalizationAvatar | null;
}

interface UserPersonalizationStoreV1 {
  version: 1;
  profiles: Record<string, UserPersonalizationV1>;
}

export interface CenteredCropRect {
  sx: number;
  sy: number;
  size: number;
}

const PERSONALIZATION_STORE_KEY = 'user_personalization';
const PERSONALIZATION_VERSION = 1;
const PRESET_AVATAR_ID_PATTERN = /^(?:[1-9]|[12]\d|3[0-5])$/;
const CUSTOM_AVATAR_DATA_URL_PATTERN = /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/;

const presetAvatarModules = import.meta.glob('../assets/profile-avatars/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

export const presetAvatarOptions = Object.entries(presetAvatarModules)
  .map(([path, url]) => {
    const match = path.match(/\/(\d+)\.png$/);
    return match ? { id: match[1], url } : null;
  })
  .filter((item): item is { id: string; url: string } => item !== null)
  .sort((left, right) => Number(left.id) - Number(right.id));

const presetAvatarUrlById = new Map(
  presetAvatarOptions.map((option) => [option.id, option.url]),
);

export const createDefaultUserPersonalization = (): UserPersonalizationV1 => ({
  version: PERSONALIZATION_VERSION,
  displayName: '',
  signature: '',
  avatar: null,
});

const normalizeText = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const normalizeAvatar = (value: unknown): UserPersonalizationAvatar | null => {
  if (!value || typeof value !== 'object') return null;
  const avatar = value as Record<string, unknown>;
  if (
    avatar.kind === PersonalizationAvatarKind.Preset
    && typeof avatar.presetId === 'string'
    && PRESET_AVATAR_ID_PATTERN.test(avatar.presetId)
  ) {
    return { kind: PersonalizationAvatarKind.Preset, presetId: avatar.presetId };
  }
  if (
    avatar.kind === PersonalizationAvatarKind.Custom
    && typeof avatar.dataUrl === 'string'
    && CUSTOM_AVATAR_DATA_URL_PATTERN.test(avatar.dataUrl)
  ) {
    return { kind: PersonalizationAvatarKind.Custom, dataUrl: avatar.dataUrl };
  }
  return null;
};

export const normalizeUserPersonalization = (value: unknown): UserPersonalizationV1 => {
  if (!value || typeof value !== 'object') return createDefaultUserPersonalization();
  const raw = value as Record<string, unknown>;
  return {
    version: PERSONALIZATION_VERSION,
    displayName: normalizeText(raw.displayName, UserPersonalizationLimits.DisplayName),
    signature: normalizeText(raw.signature, UserPersonalizationLimits.Signature),
    avatar: normalizeAvatar(raw.avatar),
  };
};

const normalizeStore = (value: unknown): UserPersonalizationStoreV1 => {
  if (!value || typeof value !== 'object') {
    return { version: PERSONALIZATION_VERSION, profiles: {} };
  }
  const rawProfiles = (value as { profiles?: unknown }).profiles;
  if (!rawProfiles || typeof rawProfiles !== 'object') {
    return { version: PERSONALIZATION_VERSION, profiles: {} };
  }
  return {
    version: PERSONALIZATION_VERSION,
    profiles: Object.fromEntries(
      Object.entries(rawProfiles as Record<string, unknown>)
        .filter(([userId]) => userId.trim().length > 0)
        .map(([userId, profile]) => [userId, normalizeUserPersonalization(profile)]),
    ),
  };
};

export const getPresetAvatarUrl = (presetId: string): string | null =>
  presetAvatarUrlById.get(presetId) ?? null;

export const resolvePersonalizationAvatarUrl = (
  avatar: UserPersonalizationAvatar | null,
): string | null => {
  if (!avatar) return null;
  return avatar.kind === PersonalizationAvatarKind.Custom
    ? avatar.dataUrl
    : getPresetAvatarUrl(avatar.presetId);
};

export const resolvePersonalizationDisplayName = (
  personalization: UserPersonalizationV1,
  phoneMasked?: string | null,
  fallback = '',
): string => personalization.displayName || phoneMasked?.trim() || fallback;

export const calculateCenteredCrop = (width: number, height: number): CenteredCropRect => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid image dimensions');
  }
  const size = Math.min(width, height);
  return {
    sx: (width - size) / 2,
    sy: (height - size) / 2,
    size,
  };
};

export const cropAvatarDataUrl = async (dataUrl: string): Promise<string> => {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to decode avatar image'));
    image.src = dataUrl;
  });

  const crop = calculateCenteredCrop(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = UserPersonalizationLimits.OutputSize;
  canvas.height = UserPersonalizationLimits.OutputSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.size,
    crop.size,
    0,
    0,
    UserPersonalizationLimits.OutputSize,
    UserPersonalizationLimits.OutputSize,
  );
  const output = canvas.toDataURL('image/webp', 0.9);
  if (!output.startsWith('data:image/webp;base64,')) {
    throw new Error('Failed to encode avatar image');
  }
  return output;
};

class UserPersonalizationService {
  public async get(userId: string): Promise<UserPersonalizationV1> {
    if (!userId.trim()) return createDefaultUserPersonalization();
    const stored = normalizeStore(await localStore.getItem<unknown>(PERSONALIZATION_STORE_KEY));
    return stored.profiles[userId] ?? createDefaultUserPersonalization();
  }

  public async set(userId: string, value: UserPersonalizationV1): Promise<UserPersonalizationV1> {
    if (!userId.trim()) throw new Error('Missing license user ID');
    const stored = normalizeStore(await localStore.getItem<unknown>(PERSONALIZATION_STORE_KEY));
    const normalized = normalizeUserPersonalization(value);
    await localStore.setItem<UserPersonalizationStoreV1>(PERSONALIZATION_STORE_KEY, {
      version: PERSONALIZATION_VERSION,
      profiles: {
        ...stored.profiles,
        [userId]: normalized,
      },
    });
    window.dispatchEvent(new CustomEvent(UserPersonalizationEvent.Updated, {
      detail: { userId, personalization: normalized },
    }));
    return normalized;
  }
}

export const userPersonalizationService = new UserPersonalizationService();
