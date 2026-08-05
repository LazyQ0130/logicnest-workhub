// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MeetingRoomMode } from '../../../shared/meetingRoom/constants';
import { SIDEBAR_NAV_GROUPS, SidebarDestination } from '../../config/brandUi';
import { MEETING_ROOM_COPY } from '../../config/meetingRoomCopy';
import { i18nService } from '../../services/i18n';
import type { Agent } from '../../types/agent';

const serviceMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('../../services/meetingRoom', () => ({
  meetingRoomService: {
    create: serviceMocks.create,
  },
}));

import { MeetingCreateView } from './MeetingRoomsView';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const agent = (id: string, name: string): Agent => ({
  id,
  name,
  description: '',
  systemPrompt: `${name} prompt`,
  identity: `${name} identity`,
  model: 'gpt-5-mini',
  workingDirectory: '',
  icon: '',
  skillIds: [],
  subagentAllowAgentIds: [],
  enabled: true,
  pinned: false,
  isDefault: id === 'main',
  source: 'custom',
  presetId: '',
  createdAt: 1,
  updatedAt: 1,
});

const agents = [agent('main', 'Alpha'), agent('reviewer', 'Beta'), agent('disabled', 'Disabled')];
agents[2].enabled = false;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  i18nService.setLanguage('en', { persist: false });
  serviceMocks.create.mockReset();
  serviceMocks.create.mockResolvedValue({ id: 'created-meeting' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const clickButtonContaining = (text: string): void => {
  const button = Array.from(container.querySelectorAll('button'))
    .find(candidate => candidate.textContent?.includes(text));
  expect(button, `button containing ${text}`).toBeTruthy();
  act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

describe('meetingRoom navigation and translations', () => {
  test('orders Work Hub, Meeting Rooms, and Automations in the work group', () => {
    const work = SIDEBAR_NAV_GROUPS.find(group => group.id === 'work');
    expect(work?.items.map(item => item.destination)).toEqual([
      SidebarDestination.WorkHub,
      SidebarDestination.MeetingRooms,
      SidebarDestination.Automations,
    ]);
  });

  test('provides complete Chinese and English meeting labels', () => {
    expect(MEETING_ROOM_COPY.zh.meetingRooms).toBe('会议室');
    expect(MEETING_ROOM_COPY.en.meetingRooms).toBe('Meeting Rooms');
    expect(Object.keys(MEETING_ROOM_COPY.zh).sort()).toEqual(Object.keys(MEETING_ROOM_COPY.en).sort());
  });
});

describe('meetingRoom create form', () => {
  test('enforces field bounds, enabled-agent selection, modes, rounds, and keyboard-sort controls', async () => {
    await act(async () => {
      root.render(<MeetingCreateView agents={agents} onCancel={vi.fn()} onCreated={vi.fn()} />);
    });

    expect(container.querySelector('input[maxlength="120"]')).toBeTruthy();
    expect(container.querySelector('textarea[maxlength="8000"]')).toBeTruthy();
    const selects = Array.from(container.querySelectorAll('select'));
    expect(selects[0].querySelectorAll('option')).toHaveLength(3);
    expect(Array.from(selects[0].querySelectorAll('option')).map(option => option.value)).toEqual([
      MeetingRoomMode.Sequential,
      MeetingRoomMode.ExpertPanel,
      MeetingRoomMode.Brainstorm,
    ]);
    expect(selects[1].querySelectorAll('option')).toHaveLength(3);
    expect(container.textContent).not.toContain('Disabled');

    clickButtonContaining('Alpha');
    clickButtonContaining('Beta');
    expect(container.querySelectorAll('textarea[maxlength="500"]')).toHaveLength(2);
    const alphaHandle = container.querySelector('button[aria-label="Alpha order"]') as HTMLButtonElement | null;
    expect(alphaHandle?.getAttribute('tabindex')).toBe('0');
    expect(alphaHandle?.getAttribute('aria-roledescription')).toBe('sortable');

    await act(async () => {
      alphaHandle?.focus();
      alphaHandle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Space', key: ' ' }));
      alphaHandle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'ArrowDown', key: 'ArrowDown' }));
      alphaHandle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Space', key: ' ' }));
    });

    const topic = container.querySelector('textarea[maxlength="8000"]') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(topic, 'Discuss the rollout.');
      topic.dispatchEvent(new Event('input', { bubbles: true }));
      topic.dispatchEvent(new Event('change', { bubbles: true }));
    });
    clickButtonContaining('Save Draft');
    await act(async () => Promise.resolve());
    expect(serviceMocks.create).toHaveBeenCalledOnce();
    const input = serviceMocks.create.mock.calls[0][0];
    expect(input.participants).toHaveLength(2);
    expect(new Set(input.participants.map((participant: { agentId: string }) => participant.agentId)))
      .toEqual(new Set(['main', 'reviewer']));
  });
});
