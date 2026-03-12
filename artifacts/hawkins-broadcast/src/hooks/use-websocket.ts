import { useState, useEffect, useRef, useCallback } from "react";

export type WsMessage = 
  | { type: "sync"; isPlaying: boolean; currentTime: number; duration: number; timestamp: number; videoUrl?: string | null }
  | { type: "connected"; role: string; sessionId: string; listenerCount?: number; state?: { isPlaying: boolean; currentTime: number; duration: number; videoUrl?: string | null } }
  | { type: "listener_count"; count: number }
  | { type: "ping"; timestamp: number }
  | { type: "pong"; timestamp: number }
  | { type: "video_url"; url: string }
  | { type: "error"; message: string }
  | { type: "broadcaster_disconnected" }
  | { type: "state"; isPlaying: boolean; currentTime: number; videoUrl?: string | null };

interface UseWebSocketOptions {
  sessionId: string;
  role: "broadcaster" | "listener";
  onMessage?: (msg: WsMessage) => void;
}

export function useWebSocket({ sessionId, role, onMessage }: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  const [listenerCount, setListenerCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pingInterval = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${sessionId}&role=${role}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Start pinging for latency measurement
      pingInterval.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        }
      }, 2000);
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (pingInterval.current) clearInterval(pingInterval.current);
      // Try to reconnect after 3s
      setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        
        if (msg.type === "pong") {
          const rtt = Date.now() - msg.timestamp;
          setLatency(Math.round(rtt / 2)); // One-way latency estimate
        } else if (msg.type === "listener_count") {
          setListenerCount(msg.count);
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

  const sendMessage = useCallback((msg: Partial<WsMessage>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return {
    isConnected,
    latency,
    listenerCount,
    sendMessage
  };
}
