import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { URL } from "url";
import { v4 as uuidv4 } from "uuid";
import {
  getSession,
  updatePlaybackState,
  sessions,
} from "./sessionManager.js";

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

// Global map of wsId → WebSocket for targeted routing
const connectionMap = new Map<string, WebSocket>();

function send(ws: WebSocket, msg: WsMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendToId(wsId: string, msg: WsMessage) {
  const ws = connectionMap.get(wsId);
  if (ws) send(ws, msg);
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

    // Assign a unique ID to this connection for WebRTC signaling routing
    const wsId = uuidv4();
    connectionMap.set(wsId, ws);

    if (role === "broadcaster") {
      if (session.broadcaster && session.broadcaster.readyState === WebSocket.OPEN) {
        send(ws, { type: "error", message: "Session already has a broadcaster" });
        ws.close(1008, "Already has broadcaster");
        connectionMap.delete(wsId);
        return;
      }
      session.broadcaster = ws;
      // Track broadcaster wsId on session for signaling
      (session as unknown as Record<string, unknown>).broadcasterWsId = wsId;

      send(ws, {
        type: "connected",
        role: "broadcaster",
        wsId,
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

          // WebRTC signaling: broadcaster sends answer to a specific listener
          } else if (msg.type === "rtc_answer") {
            const { to, sdp } = msg as { type: string; to: string; sdp: unknown };
            sendToId(to, { type: "rtc_answer", sdp, from: wsId });

          // WebRTC signaling: broadcaster sends ICE candidate to a specific listener
          } else if (msg.type === "rtc_ice") {
            const { to, candidate } = msg as { type: string; to: string; candidate: unknown };
            sendToId(to, { type: "rtc_ice", candidate, from: wsId });
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
        connectionMap.delete(wsId);
      });

    } else {
      // listener
      session.listeners.add(ws);
      broadcastListenerCount(sessionId);

      send(ws, {
        type: "connected",
        role: "listener",
        wsId,
        sessionId,
        state: session.playbackState,
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsMessage;

          if (msg.type === "ping") {
            send(ws, { type: "pong", timestamp: msg.timestamp });

          // WebRTC signaling: listener sends offer to broadcaster
          } else if (msg.type === "rtc_offer") {
            const { sdp } = msg as { type: string; sdp: unknown };
            if (session.broadcaster) {
              send(session.broadcaster, {
                type: "rtc_offer",
                from: wsId,
                sdp,
              });
            }

          // WebRTC signaling: listener sends ICE candidate to broadcaster
          } else if (msg.type === "rtc_ice") {
            const { candidate } = msg as { type: string; candidate: unknown };
            if (msg.to === "broadcaster" && session.broadcaster) {
              send(session.broadcaster, {
                type: "rtc_ice",
                from: wsId,
                candidate,
              });
            }
          }
        } catch {
          // ignore
        }
      });

      ws.on("close", () => {
        session.listeners.delete(ws);
        broadcastListenerCount(sessionId);
        connectionMap.delete(wsId);
        // Notify broadcaster that this listener's RTC peer should be cleaned up
        if (session.broadcaster) {
          send(session.broadcaster, { type: "rtc_peer_disconnected", peerId: wsId });
        }
      });
    }
  });

  return wss;
}
