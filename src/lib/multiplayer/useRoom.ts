"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "./socket";
import type {
  GameRoom,
  KickedPayload,
  RoomErrorCode,
  RoomErrorPayload,
} from "./types";

// ── LocalStorage persistence keys ────────────────────────────────────────────

const STORAGE_KEY = "worldatwar_player";

type StoredPlayer = {
  playerId: string;
  playerName: string;
  activeRoomCode?: string;
};

function loadStoredPlayer(): StoredPlayer {
  try {
    if (typeof window === "undefined") return { playerId: "", playerName: "" };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredPlayer;
  } catch {
    // ignore JSON parse errors
  }
  return { playerId: "", playerName: "" };
}

function saveStoredPlayer(data: Partial<StoredPlayer>): void {
  try {
    if (typeof window === "undefined") return;
    const current = loadStoredPlayer();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...data }));
  } catch {
    // ignore storage errors
  }
}

function makePlayerId(): string {
  return `player_${Math.random().toString(36).slice(2, 11)}`;
}

// ── Hook return type ──────────────────────────────────────────────────────────

export type RoomHookState = {
  /** Socket transport is established */
  connected: boolean;
  /** Socket is in the process of connecting / reconnecting */
  connecting: boolean;
  /** Current room state — null when not in a room */
  room: GameRoom | null;
  /** Last room-level error code */
  error: RoomErrorCode | null;
  /** True for the turn after the local player was kicked */
  wasKicked: boolean;
  localPlayerId: string;
  localPlayerName: string;
};

export type RoomHookActions = {
  createRoom: (playerName: string) => void;
  joinRoom: (code: string, playerName: string) => void;
  leaveRoom: () => void;
  kickPlayer: (targetId: string) => void;
  startGame: () => void;
  clearError: () => void;
  clearKicked: () => void;
  setLocalPlayerName: (name: string) => void;
};

// ── useRoom hook ──────────────────────────────────────────────────────────────

export function useRoom(): RoomHookState & RoomHookActions {
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [room, setRoom]             = useState<GameRoom | null>(null);
  const [error, setError]           = useState<RoomErrorCode | null>(null);
  const [wasKicked, setWasKicked]   = useState(false);

  // Stable refs for values used inside callbacks that must not change identity
  const playerRef = useRef<StoredPlayer>({ playerId: "", playerName: "" });
  const roomRef   = useRef<GameRoom | null>(null);

  const [localPlayerId, setLocalPlayerId]     = useState("");
  const [localPlayerName, setLocalPlayerNameState] = useState("");

  // ── Initialize player identity on mount ──────────────────────────────────
  useEffect(() => {
    const stored = loadStoredPlayer();
    const id = stored.playerId || makePlayerId();
    const next: StoredPlayer = { ...stored, playerId: id };
    playerRef.current = next;
    saveStoredPlayer(next);
    setLocalPlayerId(id);
    setLocalPlayerNameState(stored.playerName ?? "");
  }, []);

  // Keep roomRef in sync
  useEffect(() => { roomRef.current = room; }, [room]);

  // ── Socket lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!localPlayerId) return; // wait for identity to be initialised

    const socket = getSocket();

    // ── connect / disconnect ────────────────────────────────────────────────
    const onConnect = () => {
      setConnected(true);
      setConnecting(false);

      // Attempt to restore a previous room on reconnect
      const { activeRoomCode, playerId } = playerRef.current;
      if (activeRoomCode && playerId) {
        socket.emit("room:reconnect", { code: activeRoomCode, playerId });
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      setConnecting(true);
    };

    // ── room events ─────────────────────────────────────────────────────────
    const onRoomCreated = (r: GameRoom) => {
      setRoom(r);
      setError(null);
      saveStoredPlayer({ activeRoomCode: r.code });
    };

    const onRoomJoined = (r: GameRoom) => {
      setRoom(r);
      setError(null);
      saveStoredPlayer({ activeRoomCode: r.code });
    };

    const onRoomUpdated = (r: GameRoom) => {
      setRoom(r);
    };

    const onRoomKicked = ({ room: r, kickedId }: KickedPayload) => {
      if (kickedId === playerRef.current.playerId) {
        setRoom(null);
        setWasKicked(true);
        saveStoredPlayer({ activeRoomCode: undefined });
      } else {
        setRoom(r);
      }
    };

    const onRoomStarted = (r: GameRoom) => {
      setRoom(r);
    };

    const onRoomLeft = () => {
      setRoom(null);
      saveStoredPlayer({ activeRoomCode: undefined });
    };

    const onRoomError = ({ error: err }: RoomErrorPayload) => {
      setError(err);
    };

    // Register all listeners
    socket.on("connect",          onConnect);
    socket.on("disconnect",       onDisconnect);
    socket.on("room:created",     onRoomCreated);
    socket.on("room:joined",      onRoomJoined);
    socket.on("room:updated",     onRoomUpdated);
    socket.on("room:kicked",      onRoomKicked);
    socket.on("room:started",     onRoomStarted);
    socket.on("room:left",        onRoomLeft);
    socket.on("room:error",       onRoomError);

    // Connect (idempotent if already connected)
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect",       onConnect);
      socket.off("disconnect",    onDisconnect);
      socket.off("room:created",  onRoomCreated);
      socket.off("room:joined",   onRoomJoined);
      socket.off("room:updated",  onRoomUpdated);
      socket.off("room:kicked",   onRoomKicked);
      socket.off("room:started",  onRoomStarted);
      socket.off("room:left",     onRoomLeft);
      socket.off("room:error",    onRoomError);
    };
  }, [localPlayerId]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const createRoom = useCallback((playerName: string) => {
    playerRef.current.playerName = playerName;
    saveStoredPlayer({ playerName });
    setLocalPlayerNameState(playerName);
    getSocket().emit("room:create", {
      playerName,
      playerId: playerRef.current.playerId,
    });
  }, []);

  const joinRoom = useCallback((code: string, playerName: string) => {
    playerRef.current.playerName = playerName;
    saveStoredPlayer({ playerName });
    setLocalPlayerNameState(playerName);
    setError(null);
    getSocket().emit("room:join", {
      code: code.toUpperCase().trim(),
      playerName,
      playerId: playerRef.current.playerId,
    });
  }, []);

  const leaveRoom = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("room:leave", {
      code: r.code,
      playerId: playerRef.current.playerId,
    });
    setRoom(null);
    saveStoredPlayer({ activeRoomCode: undefined });
  }, []);

  const kickPlayer = useCallback((targetId: string) => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("room:kick", {
      code: r.code,
      hostId: playerRef.current.playerId,
      targetId,
    });
  }, []);

  const startGame = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("room:start", {
      code: r.code,
      hostId: playerRef.current.playerId,
    });
  }, []);

  const clearError  = useCallback(() => setError(null), []);
  const clearKicked = useCallback(() => setWasKicked(false), []);

  const setLocalPlayerName = useCallback((name: string) => {
    setLocalPlayerNameState(name);
    playerRef.current.playerName = name;
    saveStoredPlayer({ playerName: name });
  }, []);

  return {
    connected,
    connecting,
    room,
    error,
    wasKicked,
    localPlayerId,
    localPlayerName,
    createRoom,
    joinRoom,
    leaveRoom,
    kickPlayer,
    startGame,
    clearError,
    clearKicked,
    setLocalPlayerName,
  };
}
