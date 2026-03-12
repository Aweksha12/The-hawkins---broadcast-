import { Router, type IRouter } from "express";
import {
  CreateSessionBody,
  GetSessionParams,
  GetPlaybackStateParams,
} from "@workspace/api-zod";
import {
  createSession,
  getSession,
} from "../lib/sessionManager.js";

const router: IRouter = Router();

router.post("/sessions", (req, res) => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { broadcasterName, videoUrl } = parsed.data;
  const session = createSession(broadcasterName, videoUrl ?? undefined);
  res.json({
    id: session.id,
    broadcasterName: session.broadcasterName,
    videoUrl: session.videoUrl,
    listenerCount: session.listeners.size,
    createdAt: session.createdAt,
  });
});

router.get("/sessions/:sessionId", (req, res) => {
  const parsed = GetSessionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const session = getSession(parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({
    id: session.id,
    broadcasterName: session.broadcasterName,
    videoUrl: session.videoUrl,
    listenerCount: session.listeners.size,
    createdAt: session.createdAt,
  });
});

router.get("/sessions/:sessionId/state", (req, res) => {
  const parsed = GetPlaybackStateParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const session = getSession(parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session.playbackState);
});

export default router;
