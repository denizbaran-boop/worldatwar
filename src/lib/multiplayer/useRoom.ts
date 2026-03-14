"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "./socket";
import type {
  GameRoom,
  KickedPayload,
  RoomErrorCode,
  RoomErrorPayload,
  RoomGameConfig
} from "./types";

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
    // ignore parse errors
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

export type RoomHookState = {
  connected: boolean;
  connecting: boolean;
  room: GameRoom | null;
  error: RoomErrorCode | null;
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
  updateRoomConfig: (config: Partial<RoomGameConfig>) => void;
  createMatch: () => void;
  clearError: () => void;
  clearKicked: () => void;
  setLocalPlayerName: (name: string) => void;
};

export function useRoom(): RoomHookState & RoomHookActions {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [error, setError] = useState<RoomErrorCode | null>(null);
  const [wasKicked, setWasKicked] = useState(false);

  const playerRef = useRef<StoredPlayer>({ playerId: "", playerName: "" });
  const roomRef = useRef<GameRoom | null>(null);

  const [localPlayerId, setLocalPlayerId] = useState("");
  const [localPlayerName, setLocalPlayerNameState] = useState("");

  useEffect(() => {
    const stored = loadStoredPlayer();
    const id = stored.playerId || makePlayerId();
    const next: StoredPlayer = { ...stored, playerId: id };
    playerRef.current = next;
    saveStoredPlayer(next);
    setLocalPlayerId(id);
    setLocalPlayerNameState(stored.playerName ?? "");
  }, []);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (!localPlayerId) return;

    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      setConnecting(false);

      const { activeRoomCode, playerId } = playerRef.current;
      if (activeRoomCode && playerId) {
        socket.emit("room:reconnect", { code: activeRoomCode, playerId });
      }
    };

    const onDisconnect = () => {
      setConnected(false);
      setConnecting(true);
    };

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

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:created", onRoomCreated);
    socket.on("room:joined", onRoomJoined);
    socket.on("room:updated", onRoomUpdated);
    socket.on("room:kicked", onRoomKicked);
    socket.on("room:started", onRoomStarted);
    socket.on("room:left", onRoomLeft);
    socket.on("room:error", onRoomError);

    if (socket.connected) {
      onConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:created", onRoomCreated);
      socket.off("room:joined", onRoomJoined);
      socket.off("room:updated", onRoomUpdated);
      socket.off("room:kicked", onRoomKicked);
      socket.off("room:started", onRoomStarted);
      socket.off("room:left", onRoomLeft);
      socket.off("room:error", onRoomError);
    };
  }, [localPlayerId]);

  const createRoom = useCallback((playerName: string) => {
    playerRef.current.playerName = playerName;
    saveStoredPlayer({ playerName });
    setLocalPlayerNameState(playerName);
    getSocket().emit("room:create", {
      playerName,
      playerId: playerRef.current.playerId
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
      playerId: playerRef.current.playerId
    });
  }, []);

  const leaveRoom = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("room:leave", {
      code: r.code,
      playerId: playerRef.current.playerId
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
      targetId
    });
  }, []);

  const startGame = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("room:start", {
      code: r.code,
      hostId: playerRef.current.playerId
    });
  }, []);

  const updateRoomConfig = useCallback((config: Partial<RoomGameConfig>) => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("room:config_update", {
      code: r.code,
      hostId: playerRef.current.playerId,
      config
    });
  }, []);

  const createMatch = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    getSocket().emit("match:create", {
      roomCode: r.code,
      hostId: playerRef.current.playerId
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);
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
    updateRoomConfig,
    createMatch,
    clearError,
    clearKicked,
    setLocalPlayerName
  };
}
