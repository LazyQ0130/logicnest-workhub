// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { MeetingRoomMode } from '../../shared/meetingRoom/constants';
import { meetingRoomService } from './meetingRoom';

const unsubscribe = vi.fn();
const api = {
  list: vi.fn().mockResolvedValue([]),
  get: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  appendRound: vi.fn(),
  retryHost: vi.fn(),
  exportMarkdown: vi.fn(),
  exportHtml: vi.fn(),
  onChanged: vi.fn(() => unsubscribe),
  onTurnUpdate: vi.fn(() => unsubscribe),
};

beforeEach(() => {
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { meetingRoom: api },
  });
  vi.clearAllMocks();
});

describe('meetingRoom preload service contract', () => {
  test('forwards every typed command without exposing hidden fields', async () => {
    const createInput = {
      title: '',
      topic: 'Topic',
      mode: MeetingRoomMode.Sequential,
      totalRounds: 1,
      participants: [{ agentId: 'main', roleNote: '' }, { agentId: 'reviewer', roleNote: '' }],
    };
    await meetingRoomService.list();
    await meetingRoomService.get('meeting-id');
    await meetingRoomService.create(createInput);
    await meetingRoomService.start('meeting-id', true);
    await meetingRoomService.pause('meeting-id');
    await meetingRoomService.resume('meeting-id');
    await meetingRoomService.stop('meeting-id');
    await meetingRoomService.appendRound({ meetingId: 'meeting-id', supplement: 'More' });
    await meetingRoomService.retryHost('meeting-id');
    await meetingRoomService.exportMarkdown('meeting-id');
    await meetingRoomService.exportHtml('meeting-id');
    await meetingRoomService.delete('meeting-id');

    expect(api.get).toHaveBeenCalledWith({ meetingId: 'meeting-id' });
    expect(api.create).toHaveBeenCalledWith(createInput);
    expect(api.start).toHaveBeenCalledWith({ meetingId: 'meeting-id', confirmNoVision: true });
    expect(api.appendRound).toHaveBeenCalledWith({ meetingId: 'meeting-id', supplement: 'More' });
    expect(api.delete).toHaveBeenCalledWith({ meetingId: 'meeting-id' });
  });

  test('returns real unsubscribe functions for both event streams', () => {
    const changed = vi.fn();
    const turn = vi.fn();
    const stopChanged = meetingRoomService.onChanged(changed);
    const stopTurn = meetingRoomService.onTurnUpdate(turn);
    expect(api.onChanged).toHaveBeenCalledWith(changed);
    expect(api.onTurnUpdate).toHaveBeenCalledWith(turn);
    expect(stopChanged).toBe(unsubscribe);
    expect(stopTurn).toBe(unsubscribe);
  });
});
