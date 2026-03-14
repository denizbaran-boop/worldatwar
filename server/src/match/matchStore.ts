import type { MatchState } from "./matchTypes";

export interface IMatchStore {
  get(roomCode: string): MatchState | undefined;
  set(roomCode: string, match: MatchState): void;
  delete(roomCode: string): void;
  all(): MatchState[];
}

export class MemoryMatchStore implements IMatchStore {
  private readonly matches = new Map<string, MatchState>();

  get(roomCode: string): MatchState | undefined {
    return this.matches.get(roomCode);
  }

  set(roomCode: string, match: MatchState): void {
    this.matches.set(roomCode, match);
  }

  delete(roomCode: string): void {
    this.matches.delete(roomCode);
  }

  all(): MatchState[] {
    return Array.from(this.matches.values());
  }
}

export const matchStore: IMatchStore = new MemoryMatchStore();
