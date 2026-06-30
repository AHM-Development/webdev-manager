"use client";

import { io, type Socket } from "socket.io-client";

import { getAccessToken } from "@/libs/api/token-store";

let socket: Socket | null = null;

function socketUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return undefined;
  return apiUrl.replace(/\/api\/v1\/?$/, "");
}

export function getRealtimeSocket() {
  if (typeof window === "undefined") return null;

  const token = getAccessToken();

  if (!socket) {
    socket = io(socketUrl(), {
      autoConnect: false,
      path: "/socket.io",
      withCredentials: true,
      auth: { token },
    });
  }

  socket.auth = { token };
  return socket;
}

export function connectRealtime() {
  const activeSocket = getRealtimeSocket();
  if (!activeSocket) return null;
  if (!activeSocket.connected) activeSocket.connect();
  return activeSocket;
}

export function disconnectRealtime() {
  if (socket) socket.disconnect();
}
