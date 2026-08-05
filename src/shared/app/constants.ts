export const AppIpcChannel = {
  GetKeyfromAttribution: 'app:getKeyfromAttribution',
  OpenSystemNotificationSettings: 'app:openSystemNotificationSettings',
  OpenDocumentation: 'app:openDocumentation',
} as const;

export type AppIpcChannel = (typeof AppIpcChannel)[keyof typeof AppIpcChannel];

export const AppDocumentation = {
  UserManual: 'user-manual',
  Security: 'security',
} as const;

export type AppDocumentation = (typeof AppDocumentation)[keyof typeof AppDocumentation];
