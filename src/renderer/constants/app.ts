import { BRAND } from '../../shared/brand';

export const APP_NAME = BRAND.displayName;
export const APP_ID = BRAND.slug;
export const EXPORT_FORMAT_TYPE = BRAND.exportFormatType;

// This value only provides backwards-compatible obfuscation for portable
// provider exports. The Settings UI clearly labels those files as sensitive;
// it is not treated as a secret or security boundary.
export const EXPORT_PASSWORD = `${BRAND.slug}-provider-export`;
