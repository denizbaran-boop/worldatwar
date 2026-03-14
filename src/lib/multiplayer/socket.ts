/**
 * Socket.IO client singleton.
 *
 * Lazily created on first access. Always returns the same instance within
 * a browser session so multiple React components don't open duplicate connections.
 *
 * Set NEXT_PUBLIC_SOCKET_URL in .env.local to point at the realtime server.
 * Default: http://localhost:3001
 */

import { type Socket, io } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  // Guard against SSR — socket.io-client must only run in the browser
  if (typeof window === "undefined") {
    throw new Error("getSocket() must only be called client-side");
  }

  if (!socket) {
    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

    socket = io(url, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });
  }

  return socket;
}

/** Disconnect and destroy the singleton (e.g. on logout / test teardown). */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
