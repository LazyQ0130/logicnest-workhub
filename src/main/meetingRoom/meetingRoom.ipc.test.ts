import { EventEmitter } from 'events';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  MeetingExportStatus,
  MeetingRoomIpcChannel,
  MeetingRoomStatus,
  MeetingTurnStatus,
} from '../../shared/meetingRoom';

const electronMocks = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  send: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: electronMocks.send } }],
  },
  dialog: { showSaveDialog: electronMocks.showSaveDialog },
}));

import { MeetingRoomCoordinator } from './coordinator';
import { registerMeetingRoomIpcHandlers } from './ipcHandlers';

type Handler = (event: unknown, input?: unknown) => unknown;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();

  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }
}

class FakeCoordinator extends EventEmitter {
  list = vi.fn(() => []);
  get = vi.fn(() => ({ title: 'Meeting' }));
  create = vi.fn();
  delete = vi.fn();
  start = vi.fn();
  pause = vi.fn();
  resume = vi.fn();
  stop = vi.fn();
  appendRound = vi.fn();
  retryHost = vi.fn();
}

const validId = '123e4567-e89b-42d3-a456-426614174000';
let ipc: FakeIpcMain;
let coordinator: FakeCoordinator;

beforeEach(() => {
  vi.clearAllMocks();
  ipc = new FakeIpcMain();
  coordinator = new FakeCoordinator();
});

describe('meetingRoom IPC', () => {
  test('registers the complete typed command surface and validates every identifier input', async () => {
    registerMeetingRoomIpcHandlers(
      ipc as unknown as Parameters<typeof registerMeetingRoomIpcHandlers>[0],
      coordinator as unknown as MeetingRoomCoordinator,
    );
    const commandChannels = Object.values(MeetingRoomIpcChannel)
      .filter(channel => channel !== MeetingRoomIpcChannel.Changed && channel !== MeetingRoomIpcChannel.TurnUpdate);
    expect([...ipc.handlers.keys()].sort()).toEqual([...commandChannels].sort());

    for (const channel of [
      MeetingRoomIpcChannel.Get,
      MeetingRoomIpcChannel.Delete,
      MeetingRoomIpcChannel.Pause,
      MeetingRoomIpcChannel.Resume,
      MeetingRoomIpcChannel.Stop,
      MeetingRoomIpcChannel.RetryHost,
    ]) {
      await expect(Promise.resolve().then(() => ipc.handlers.get(channel)?.({}, { meetingId: 'bad' })))
        .rejects.toThrow('MEETING_INVALID_ID');
    }
    await expect(Promise.resolve().then(() => ipc.handlers.get(MeetingRoomIpcChannel.Start)?.({}, {
      meetingId: validId,
      confirmNoVision: 'yes',
    }))).rejects.toThrow('MEETING_INVALID_CONFIRMATION');
    await expect(Promise.resolve().then(() => ipc.handlers.get(MeetingRoomIpcChannel.AppendRound)?.({}, {
      meetingId: 'bad',
      supplement: 'More',
    }))).rejects.toThrow('MEETING_INVALID_ID');
    for (const channel of [MeetingRoomIpcChannel.ExportMarkdown, MeetingRoomIpcChannel.ExportHtml]) {
      await expect(ipc.handlers.get(channel)?.({}, { meetingId: 'bad' })).resolves.toEqual({
        status: MeetingExportStatus.Error,
        error: 'MEETING_INVALID_ID',
      });
    }
  });

  test('forwards stable arguments, broadcasts versioned events, and removes coordinator listeners', async () => {
    const dispose = registerMeetingRoomIpcHandlers(
      ipc as unknown as Parameters<typeof registerMeetingRoomIpcHandlers>[0],
      coordinator as unknown as MeetingRoomCoordinator,
    );
    await ipc.handlers.get(MeetingRoomIpcChannel.Start)?.({}, { meetingId: validId, confirmNoVision: true });
    await ipc.handlers.get(MeetingRoomIpcChannel.AppendRound)?.({}, { meetingId: validId, supplement: 'More' });
    expect(coordinator.start).toHaveBeenCalledWith(validId, true);
    expect(coordinator.appendRound).toHaveBeenCalledWith(validId, 'More');

    coordinator.emit('changed', { meetingId: validId, status: MeetingRoomStatus.Running, version: 3 });
    coordinator.emit('turnUpdate', {
      meetingId: validId,
      turnId: validId,
      attemptId: validId,
      status: MeetingTurnStatus.Running,
      content: 'partial',
      version: 4,
    });
    expect(electronMocks.send).toHaveBeenCalledTimes(2);
    expect(electronMocks.send.mock.calls[0][1]).toMatchObject({ version: 3 });
    expect(electronMocks.send.mock.calls[1][1]).toMatchObject({ version: 4 });
    dispose();
    expect(coordinator.listenerCount('changed')).toBe(0);
    expect(coordinator.listenerCount('turnUpdate')).toBe(0);
  });

  test('returns a stable cancelled export result from the system save dialog', async () => {
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true });
    registerMeetingRoomIpcHandlers(
      ipc as unknown as Parameters<typeof registerMeetingRoomIpcHandlers>[0],
      coordinator as unknown as MeetingRoomCoordinator,
    );
    const result = await ipc.handlers.get(MeetingRoomIpcChannel.ExportMarkdown)?.({}, { meetingId: validId });
    expect(result).toEqual({ status: MeetingExportStatus.Cancelled });
  });
});
