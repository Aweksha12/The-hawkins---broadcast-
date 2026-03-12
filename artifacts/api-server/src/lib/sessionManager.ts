import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  updatedAt: number;
  videoUrl: string | null;
}

export interface Session {
  id: string;
  broadcasterName: string;
  videoUrl: string | null;
  createdAt: string;
  playbackState: PlaybackState;
  broadcaster: WebSocket | null;
  listeners: Set<WebSocket>;
}

const sessions = new Map<string, Session>();

export function createSession(broadcasterName: string, videoUrl?: string): Session {
  const id = generateSessionCode();
  const session: Session = {
    id,
    broadcasterName,
    videoUrl: videoUrl ?? null,
    createdAt: new Date().toISOString(),
    playbackState: {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      updatedAt: Date.now(),
      videoUrl: videoUrl ?? null,
    },
    broadcaster: null,
    listeners: new Set(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

export function updatePlaybackState(
  sessionId: string,
  update: Partial<PlaybackState>
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.playbackState = {
    ...session.playbackState,
    ...update,
    updatedAt: Date.now(),
  };
  if (update.videoUrl !== undefined) {
    session.videoUrl = update.videoUrl;
  }
}

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return sessions.has(code) ? generateSessionCode() : code;
}

export { sessions };
