import { BrowserWindow, ipcMain } from 'electron';

import { type LicenseCredentials, LicenseIpcChannel, type LicenseRegistration } from '../../shared/license';
import { LicenseApiError } from './licenseApiClient';
import { LicenseController } from './licenseController';

export function registerLicenseIpc(controller: LicenseController): void {
  ipcMain.handle(LicenseIpcChannel.GetState, () => controller.getState());
  ipcMain.handle(LicenseIpcChannel.Register, async (_event, input: LicenseRegistration) => {
    return controller.register(input).catch(serializeLicenseError);
  });
  ipcMain.handle(LicenseIpcChannel.Login, async (_event, input: LicenseCredentials) => {
    return controller.login(input).catch(serializeLicenseError);
  });
  ipcMain.handle(LicenseIpcChannel.Redeem, async (_event, code: string) => {
    return controller.redeem(code).catch(serializeLicenseError);
  });
  ipcMain.handle(LicenseIpcChannel.Logout, () => controller.logout());
  ipcMain.handle(LicenseIpcChannel.Refresh, () => controller.refresh().catch(serializeLicenseError));
  ipcMain.handle(LicenseIpcChannel.Heartbeat, () => controller.heartbeat());
}

export function broadcastLicenseState(state: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(LicenseIpcChannel.StateChanged, state);
  }
}

function serializeLicenseError(error: unknown): { error: { code: string; message: string; status?: number } } {
  if (error instanceof LicenseApiError) {
    return { error: { code: error.code, message: error.message, status: error.status } };
  }
  console.error('[License] IPC action failed:', error);
  return { error: { code: 'LICENSE_ACTION_FAILED', message: '授权操作失败，请稍后重试' } };
}
