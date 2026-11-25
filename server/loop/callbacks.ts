import type { HitFeedbackEvent, KillFeedEntry, SnapshotPayload } from '../../shared/types';
import type { ServerRoom } from '../types';

/** What a tick sends out (the room manager forwards it to the room's sockets). */
export interface LoopCallbacks {
  emitRoomState: (room: ServerRoom) => void;
  emitSnapshot: (room: ServerRoom, snapshot: SnapshotPayload) => void;
  emitHit: (room: ServerRoom, event: HitFeedbackEvent) => void;
  emitKillFeed: (room: ServerRoom, entry: KillFeedEntry) => void;
}
