"use client";

import { useEffect, useState } from "react";

import { connectRealtime, getRealtimeSocket } from "@/libs/realtime/socket-client";

export function useRealtime() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = connectRealtime();
    if (!socket) return;

    const syncConnected = () => setConnected(socket.connected);
    socket.on("connect", syncConnected);
    socket.on("disconnect", syncConnected);
    syncConnected();

    return () => {
      socket.off("connect", syncConnected);
      socket.off("disconnect", syncConnected);
    };
  }, []);

  return {
    socket: getRealtimeSocket(),
    connected,
  };
}

export function useRealtimeEvent<TPayload>(
  eventName: string,
  handler: (payload: TPayload) => void
) {
  useEffect(() => {
    const socket = connectRealtime();
    if (!socket) return;

    socket.on(eventName, handler);
    return () => {
      socket.off(eventName, handler);
    };
  }, [eventName, handler]);
}
