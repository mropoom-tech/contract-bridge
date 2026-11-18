/** REST API request/response schemas (docs/WEBSOCKET_PROTOCOL.md §8). */
import { z } from 'zod';

/** Plain-text nickname: trimmed, 2-24 chars, no control characters or angle brackets. */
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[^\p{Cc}<>]+$/u, 'Display name contains forbidden characters');

export const GuestLoginRequestSchema = z.object({ displayName: DisplayNameSchema }).strict();

export const CreateRoomRequestSchema = z
  .object({
    targetBoards: z.number().int().min(1).max(16).default(4),
    mode: z.enum(['CLASSIC', 'MINI', 'RUBBER']).default('CLASSIC'),
  })
  .strict();

/** 8 chars from an unambiguous alphabet (no 0/O/1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RoomCodeSchema = z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);

export interface MeResponse {
  readonly user: { readonly id: string; readonly displayName: string };
}

export interface RoomSummary {
  readonly code: string;
  readonly phase: string;
  readonly targetBoards: number;
  readonly mode: 'CLASSIC' | 'MINI' | 'RUBBER';
  readonly memberCount: number;
  readonly seatsTaken: number;
  readonly isMember: boolean;
}

export interface ApiErrorBody {
  readonly ok: false;
  readonly error: { readonly code: string; readonly message: string };
}
