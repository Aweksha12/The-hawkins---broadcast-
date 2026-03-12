import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { URL } from "url";
import {
  getSession,
  updatePlaybackState,
  sessions,
} from "./sessionManager.js";

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

function send(ws: WebSocket, msg: WsMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastToListeners(sessionId: string, msg: WsMessage) {
  const session = sessions.get(sessionId);
  if (!session) return;
  for (const listener of session.listeners) {
    send(listener, msg);
  }
}

function broadcastListenerCount(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.broadcaster) return;
  send(session.broadcaster, {
    type: "listener_count",
    count: session.listeners.size,
  });
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId") ?? "";
    const role = url.searchParams.get("role") ?? "listener";

    const session = getSession(sessionId);
    if (!session) {
      send(ws, { type: "error", message: "Session not found" });
      ws.close(1008, "Session not found");
      return;
    }

    if (role === "broadcaster") {
      if (session.broadcaster && session.broadcaster.readyState === WebSocket.OPEN) {
        send(ws, { type: "error", message: "Session already has a broadcaster" });
        ws.close(1008, "Already has broadcaster");
        return;
      }
      session.broadcaster = ws;

      send(ws, {
        type: "connected",
        role: "broadcaster",
        sessionId,
        listenerCount: session.listeners.size,
        state: session.playbackState,
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsMessage;

          if (msg.type === "sync") {
            const { isPlaying, currentTime, duration, videoUrl } = msg as {
              type: string;
              isPlaying: boolean;
              currentTime: number;
              duration: number;
              videoUrl?: string | null;
            };
            updatePlaybackState(sessionId, {
              isPlaying,
              currentTime,
              duration: duration ?? session.playbackState.duration,
              videoUrl: videoUrl !== undefined ? videoUrl : session.playbackState.videoUrl,
            });
            broadcastToListeners(sessionId, {
              type: "sync",
              isPlaying,
              currentTime,
              duration: duration ?? session.playbackState.duration,
              timestamp: Date.now(),
              videoUrl: session.playbackState.videoUrl,
            });
          } else if (msg.type === "video_url") {
            const { url: newUrl } = msg as { type: string; url: string };
            updatePlaybackState(sessionId, { videoUrl: newUrl });
            broadcastToListeners(sessionId, { type: "video_url", url: newUrl });
          } else if (msg.type === "ping") {
            send(ws, { type: "pong", timestamp: msg.timestamp });
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("close", () => {
        if (session.broadcaster === ws) {
          session.broadcaster = null;
          broadcastToListeners(sessionId, { type: "broadcaster_disconnected" });
        }
      });
    } else {
      session.listeners.add(ws);
      broadcastListenerCount(sessionId);

      send(ws, {
        type: "connected",
        role: "listener",
        sessionId,
        state: session.playbackState,
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsMessage;
          if (msg.type === "ping") {
            send(ws, { type: "pong", timestamp: msg.timestamp });
          }
        } catch {
          // ignore
        }
      });

      ws.on("close", () => {
        session.listeners.delete(ws);
        broadcastListenerCount(sessionId);
      });
    }
  });

  return wss;
}
