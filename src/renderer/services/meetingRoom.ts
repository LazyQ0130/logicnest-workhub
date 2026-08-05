import type {
  MeetingRoomAppendRoundInput,
  MeetingRoomChangedEvent,
  MeetingRoomCreateInput,
  MeetingRoomDto,
  MeetingRoomListItemDto,
  MeetingRoomTurnUpdateEvent,
} from '../../shared/meetingRoom';

class MeetingRoomService {
  list(): Promise<MeetingRoomListItemDto[]> {
    return window.electron.meetingRoom.list();
  }

  get(meetingId: string): Promise<MeetingRoomDto> {
    return window.electron.meetingRoom.get({ meetingId });
  }

  create(input: MeetingRoomCreateInput): Promise<MeetingRoomDto> {
    return window.electron.meetingRoom.create(input);
  }

  delete(meetingId: string): Promise<void> {
    return window.electron.meetingRoom.delete({ meetingId });
  }

  start(meetingId: string, confirmNoVision = false): Promise<MeetingRoomDto> {
    return window.electron.meetingRoom.start({ meetingId, confirmNoVision });
  }

  pause(meetingId: string): Promise<MeetingRoomDto> {
    return window.electron.meetingRoom.pause({ meetingId });
  }

  resume(meetingId: string): Promise<MeetingRoomDto> {
    return window.electron.meetingRoom.resume({ meetingId });
  }

  stop(meetingId: string): Promise<MeetingRoomDto> {
    return window.electron.meetingRoom.stop({ meetingId });
  }

  appendRound(input: MeetingRoomAppendRoundInput): Promise<MeetingRoomDto> {
    return window.electron.meetingRoom.appendRound(input);
  }

  retryHost(meetingId: string): Promise<MeetingRoomDto> {
    return window.electron.meetingRoom.retryHost({ meetingId });
  }

  exportMarkdown(meetingId: string) {
    return window.electron.meetingRoom.exportMarkdown({ meetingId });
  }

  exportHtml(meetingId: string) {
    return window.electron.meetingRoom.exportHtml({ meetingId });
  }

  onChanged(callback: (event: MeetingRoomChangedEvent) => void): () => void {
    return window.electron.meetingRoom.onChanged(callback);
  }

  onTurnUpdate(callback: (event: MeetingRoomTurnUpdateEvent) => void): () => void {
    return window.electron.meetingRoom.onTurnUpdate(callback);
  }
}

export const meetingRoomService = new MeetingRoomService();
