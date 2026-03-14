import type { GameRoom } from "../types";

/**
 * IRoomStore — storage interface for game rooms.
 *
 * Currently backed by a module-level Map (server memory).
 * To swap in Redis/Upstash later, implement this interface with a Redis client
 * and replace `export const roomStore` below.
 *
 * Redis implementation sketch:
 *   class RedisRoomStore implements IRoomStore {
 *     async get(code)  { return JSON.parse(await redis.get(`room:${code}`) ?? "null"); }
 *     async set(code, room) { await redis.setex(`room:${code}`, 3600, JSON.stringify(room)); }
 *     async delete(code)    { await redis.del(`room:${code}`); }
 *   }
 */
export interface IRoomStore {
  get(code: string): GameRoom | undefined;
  set(code: string, room: GameRoom): void;
  delete(code: string): void;
  all(): GameRoom[];
}

export class MemoryRoomStore implements IRoomStore {
  private readonly rooms = new Map<string, GameRoom>();

  get(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  set(code: string, room: GameRoom): void {
    this.rooms.set(code, room);
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  all(): GameRoom[] {
    return Array.from(this.rooms.values());
  }
}

export const roomStore: IRoomStore = new MemoryRoomStore();
