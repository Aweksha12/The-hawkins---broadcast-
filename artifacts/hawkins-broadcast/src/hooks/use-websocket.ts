import { useState, useEffect, useRef, useCallback } from "react";

export type WsMessage =
  | { type: "sync"; isPlaying: boolean; currentTime: number; duration: number; timestamp: number; videoUrl?: string | null }
  | { type: "connected"; role: string; wsId: string; sessionId: string; listenerCount?: number; state?: { isPlaying: boolean; currentTime: number; duration: number; videoUrl?: string | null } }
  | { type: "listener_count"; count: number }
  | { type: "ping"; timestamp: number }
  | { type: "pong"; timestamp: number }
  | { type: "video_url"; url: string }
  | { type: "error"; message: string }
  | { type: "broadcaster_disconnected" }
  | { type: "state"; isPlaying: boolean; currentTime: number; videoUrl?: string | null }
  // WebRTC signaling
  | { type: "rtc_offer"; from: string; sdp: RTCSessionDescriptionInit }
  | { type: "rtc_answer"; sdp: RTCSessionDescriptionInit; from?: string }
  | { type: "rtc_ice"; candidate: RTCIceCandidateInit; from?: string }
  | { type: "rtc_peer_disconnected"; peerId: string };

interface UseWebSocketOptions {
  sessionId: string;
  role: "broadcaster" | "listener";
  onMessage?: (msg: WsMessage) => void;
}

export function useWebSocket({ sessionId, role, onMessage }: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  const [listenerCount, setListenerCount] = useState(0);
  const [myWsId, setMyWsId] = useState<string>("");
  const [connectedSince, setConnectedSince] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${sessionId}&role=${role}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConnectedSince(Date.now());
      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        }
      }, 2000);
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (pingInterval.current) clearInterval(pingInterval.current);
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;

        if (msg.type === "pong") {
          const rtt = Date.now() - (msg as { type: "pong"; timestamp: number }).timestamp;
          setLatency(Math.round(rtt / 2));
        } else if (msg.type === "listener_count") {
          setListenerCount((msg as { type: "listener_count"; count: number }).count);
        } else if (msg.type === "connected") {
          setMyWsId((msg as { type: "connected"; wsId: string } & Record<string, unknown>).wsId);
        }

        onMessage?.(msg);
      } catch (err) {
        console.error("Failed to parse WS message", err);
      }
    };
  }, [sessionId, role, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return {
    isConnected,
    latency,
    listenerCount,
    myWsId,
    connectedSince,
    sendMessage,
  };
}
