import type { PrismaClient } from '@prisma/client';

export const LicenseMode = {
  SingleDevice: 'SINGLE_DEVICE',
  MultiDeviceSingleSession: 'MULTI_DEVICE_SINGLE_SESSION',
} as const;

export type LicenseMode = (typeof LicenseMode)[keyof typeof LicenseMode];

export const LICENSE_POLICY_ID = 'default';

type PolicyDb = {
  licensePolicy?: {
    findUnique: (args: { where: { id: string }; select?: { mode: true } }) => Promise<{ mode: string } | null>;
  };
};

export async function getLicenseMode(db: PrismaClient | PolicyDb): Promise<LicenseMode> {
  const delegate = (db as PolicyDb).licensePolicy;
  if (!delegate) return LicenseMode.SingleDevice;
  const policy = await delegate.findUnique({ where: { id: LICENSE_POLICY_ID }, select: { mode: true } });
  return policy?.mode === LicenseMode.MultiDeviceSingleSession
    ? LicenseMode.MultiDeviceSingleSession
    : LicenseMode.SingleDevice;
}
