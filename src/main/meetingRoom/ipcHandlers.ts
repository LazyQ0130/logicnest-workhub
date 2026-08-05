import { BrowserWindow, dialog, type IpcMain } from 'electron';
import fs from 'fs';
import path from 'path';

import {
  MeetingExportStatus,
  MeetingRoomIpcChannel,
} from '../../shared/meetingRoom';
import type {
  MeetingRoomAppendRoundInput,
  MeetingRoomChangedEvent,
  MeetingRoomIdInput,
  MeetingRoomStartInput,
  MeetingRoomTurnUpdateEvent,
} from '../../shared/meetingRoom/types';
import { t } from '../i18n';
import { MeetingRoomCoordinator } from './coordinator';
import { exportMeetingHtml, exportMeetingMarkdown } from './exporter';
import { validateMeetingId } from './validation';

const safeFileName = (value: string): string =>
  value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'meeting';

const broadcast = (channel: string, payload: unknown): void => {
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  });
};

const readMeetingIdInput = (value: unknown): string => {
  if (!value || typeof value !== 'object') throw new Error('MEETING_INVALID_INPUT');
  return validateMeetingId((value as Partial<MeetingRoomIdInput>).meetingId);
};

export const registerMeetingRoomIpcHandlers = (
  ipcMain: IpcMain,
  coordinator: MeetingRoomCoordinator,
): (() => void) => {
  ipcMain.handle(MeetingRoomIpcChannel.List, () => coordinator.list());
  ipcMain.handle(MeetingRoomIpcChannel.Get, (_event, input: unknown) => coordinator.get(readMeetingIdInput(input)));
  ipcMain.handle(MeetingRoomIpcChannel.Create, (_event, input: unknown) => coordinator.create(input));
  ipcMain.handle(MeetingRoomIpcChannel.Delete, (_event, input: unknown) => coordinator.delete(readMeetingIdInput(input)));
  ipcMain.handle(MeetingRoomIpcChannel.Start, (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('MEETING_INVALID_INPUT');
    const value = input as Partial<MeetingRoomStartInput>;
    if (value.confirmNoVision !== undefined && typeof value.confirmNoVision !== 'boolean') {
      throw new Error('MEETING_INVALID_CONFIRMATION');
    }
    return coordinator.start(validateMeetingId(value.meetingId), value.confirmNoVision === true);
  });
  ipcMain.handle(MeetingRoomIpcChannel.Pause, (_event, input: unknown) => coordinator.pause(readMeetingIdInput(input)));
  ipcMain.handle(MeetingRoomIpcChannel.Resume, (_event, input: unknown) => coordinator.resume(readMeetingIdInput(input)));
  ipcMain.handle(MeetingRoomIpcChannel.Stop, (_event, input: unknown) => coordinator.stop(readMeetingIdInput(input)));
  ipcMain.handle(MeetingRoomIpcChannel.AppendRound, (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('MEETING_INVALID_INPUT');
    const value = input as Partial<MeetingRoomAppendRoundInput>;
    return coordinator.appendRound(validateMeetingId(value.meetingId), value.supplement);
  });
  ipcMain.handle(MeetingRoomIpcChannel.RetryHost, (_event, input: unknown) => coordinator.retryHost(readMeetingIdInput(input)));

  const exportFile = async (input: unknown, format: 'markdown' | 'html') => {
    try {
      const meeting = coordinator.get(readMeetingIdInput(input));
      const extension = format === 'markdown' ? 'md' : 'html';
      const result = await dialog.showSaveDialog({
        title: format === 'markdown' ? t('meetingExportMarkdownTitle') : t('meetingExportHtmlTitle'),
        defaultPath: `${safeFileName(meeting.title)}.${extension}`,
        filters: [{
          name: format === 'markdown' ? t('meetingExportMarkdownFilter') : t('meetingExportHtmlFilter'),
          extensions: [extension],
        }],
      });
      if (result.canceled || !result.filePath) return { status: MeetingExportStatus.Cancelled };
      const outputPath = path.resolve(result.filePath);
      const content = format === 'markdown'
        ? exportMeetingMarkdown(meeting)
        : exportMeetingHtml(meeting);
      fs.writeFileSync(outputPath, content, 'utf8');
      return { status: MeetingExportStatus.Success, path: outputPath };
    } catch (error) {
      return {
        status: MeetingExportStatus.Error,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
  ipcMain.handle(MeetingRoomIpcChannel.ExportMarkdown, (_event, input: unknown) => exportFile(input, 'markdown'));
  ipcMain.handle(MeetingRoomIpcChannel.ExportHtml, (_event, input: unknown) => exportFile(input, 'html'));

  const changed = (event: MeetingRoomChangedEvent) => broadcast(MeetingRoomIpcChannel.Changed, event);
  const turnUpdate = (event: MeetingRoomTurnUpdateEvent) => broadcast(MeetingRoomIpcChannel.TurnUpdate, event);
  coordinator.on('changed', changed);
  coordinator.on('turnUpdate', turnUpdate);
  return () => {
    coordinator.off('changed', changed);
    coordinator.off('turnUpdate', turnUpdate);
  };
};
