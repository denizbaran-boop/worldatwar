import type { MatchState } from "../match/matchTypes";

export type ValidationResult = { ok: true } | { ok: false; error: string };

export const ok = (): ValidationResult => ({ ok: true });

export const fail = (error: string): ValidationResult => ({ ok: false, error });

export function validateLobbyPlayer(match: MatchState, lobbyPlayerId: string): ValidationResult {
  if (!match.lobbyToGamePlayer[lobbyPlayerId]) return fail("player_not_in_match");
  return ok();
}

export function validateTurnOwnership(match: MatchState, gamePlayerId: string): ValidationResult {
  if (match.currentPlayerId !== gamePlayerId) return fail("not_your_turn");
  return ok();
}

export function validateActivePhase(match: MatchState): ValidationResult {
  if (match.phase !== "in_game") return fail("match_not_in_game");
  if (match.gameOver) return fail("match_finished");
  return ok();
}
