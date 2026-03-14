"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSocket } from "./socket";
import type { GameAction, MatchState } from "./types";

type MatchHookArgs = {
  roomCode: string | null;
  lobbyPlayerId: string;
  enabled: boolean;
};

type MatchHookState = {
  match: MatchState | null;
  syncing: boolean;
  error: string | null;
  sendAction: (action: GameAction) => void;
  requestState: () => void;
};

export function useMatch({ roomCode, lobbyPlayerId, enabled }: MatchHookArgs): MatchHookState {
  const [match, setMatch] = useState<MatchState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !roomCode || !lobbyPlayerId) return;

    const socket = getSocket();
    setSyncing(true);

    const onCreated = ({ matchState }: { matchState: MatchState }) => {
      setMatch(matchState);
      setSyncing(false);
      setError(null);
    };

    const onState = ({ matchState }: { matchState: MatchState }) => {
      setMatch(matchState);
      setSyncing(false);
      setError(null);
    };

    const onUpdated = ({ matchState }: { matchState: MatchState }) => {
      setMatch(matchState);
      setSyncing(false);
      setError(null);
    };

    const onError = ({ error: code }: { event: string; error: string }) => {
      setError(code);
      setSyncing(false);
    };

    socket.on("match:created", onCreated);
    socket.on("match:state", onState);
    socket.on("match:updated", onUpdated);
    socket.on("match:error", onError);

    socket.emit("match:reconnect", { roomCode, lobbyPlayerId });

    return () => {
      socket.off("match:created", onCreated);
      socket.off("match:state", onState);
      socket.off("match:updated", onUpdated);
      socket.off("match:error", onError);
    };
  }, [enabled, lobbyPlayerId, roomCode]);

  const sendAction = useCallback(
    (action: GameAction) => {
      if (!enabled || !roomCode || !lobbyPlayerId) return;
      setSyncing(true);
      getSocket().emit("match:action", { roomCode, lobbyPlayerId, action });
    },
    [enabled, lobbyPlayerId, roomCode]
  );

  const requestState = useCallback(() => {
    if (!enabled || !roomCode || !lobbyPlayerId) return;
    setSyncing(true);
    getSocket().emit("match:reconnect", { roomCode, lobbyPlayerId });
  }, [enabled, lobbyPlayerId, roomCode]);

  return useMemo(
    () => ({ match, syncing, error, sendAction, requestState }),
    [match, syncing, error, sendAction, requestState]
  );
}
