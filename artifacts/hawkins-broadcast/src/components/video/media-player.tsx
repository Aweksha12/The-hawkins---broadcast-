import { useRef, useState, useEffect, useCallback } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, AlertTriangle,
  Radio, Bug, X, Wifi, Cpu, Clock, Signal
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RetroButton } from "../ui/retro-button";
import { useWebSocket, WsMessage } from "@/hooks/use-websocket";
import { useWebRTC, STUN_SERVERS } from "@/hooks/use-webrtc";

interface MediaPlayerProps {
  url: string;
  role: "broadcaster" | "listener";
  sessionId: string;
}

function formatTC(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00:00.000";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function MediaPlayer({ url, role, sessionId }: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(role === "listener");
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"SYNCING" | "SYNCHRONIZED" | "LOST">("SYNCING");
  const [showDebug, setShowDebug] = useState(false);

  // Listener sync drift tracking
  const [broadcastTC, setBroadcastTC] = useState(0);     // last received broadcaster time
  const [syncDriftMs, setSyncDriftMs] = useState(0);     // drift in milliseconds

  // Track last sync for drift computation
  const lastSyncRef = useRef<{ time: number; timestamp: number; playing: boolean } | null>(null);

  // Broadcaster throttler
  const lastSyncSent = useRef(0);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const onWsMessage = useCallback(
    (msg: WsMessage) => {
      // Route signaling messages to RTC handler (set below via ref)
      if (
        msg.type === "rtc_offer" ||
        msg.type === "rtc_answer" ||
        msg.type === "rtc_ice" ||
        msg.type === "rtc_peer_disconnected"
      ) {
        rtcSignalingRef.current?.(msg as unknown as Record<string, unknown>);
        return;
      }

      if (role === "broadcaster") {
        // Broadcaster only cares about listener count (handled in hook)
        return;
      }

      if (msg.type === "connected" && msg.state) {
        const vid = videoRef.current;
        if (!vid) return;
        if (msg.state.currentTime > 0) vid.currentTime = msg.state.currentTime;
        if (msg.state.isPlaying) vid.play().catch(() => setNeedsInteraction(true));
        setSyncStatus("SYNCHRONIZED");
        return;
      }

      if (msg.type === "broadcaster_disconnected") {
        setSyncStatus("LOST");
        return;
      }

      if (msg.type === "state" || msg.type === "sync") {
        applySyncMessage(msg.currentTime, msg.isPlaying, msg.timestamp ?? Date.now());
      }
    },
    [role] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { isConnected, latency, listenerCount, myWsId, connectedSince, sendMessage } =
    useWebSocket({ sessionId, role, onMessage: onWsMessage });

  // ── WebRTC ────────────────────────────────────────────────────────────────
  const rtcSignalingRef = useRef<((msg: Record<string, unknown>) => void) | null>(null);

  const onRtcSync = useCallback(
    (msg: Record<string, unknown>) => {
      if (role !== "listener") return;
      if (msg.type === "sync") {
        const { currentTime: ct, isPlaying: ip, timestamp: ts } = msg as {
          type: string; currentTime: number; isPlaying: boolean; timestamp: number;
        };
        applySyncMessage(ct, ip, ts);
      }
    },
    [role] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { handleSignaling, initAsListener, broadcastViaPeers, peerInfos, hasP2P, connectedPeers } =
    useWebRTC({
      role,
      myWsId,
      sendSignaling: sendMessage,
      onSyncMessage: onRtcSync,
    });

  // Wire signaling into ref so onWsMessage can call it without stale closure
  useEffect(() => {
    rtcSignalingRef.current = handleSignaling;
  }, [handleSignaling]);

  // Initiate RTC once we have a wsId (listener only)
  useEffect(() => {
    if (role === "listener" && myWsId && isConnected) {
      initAsListener();
    }
  }, [role, myWsId, isConnected, initAsListener]);

  // ── Sync logic ────────────────────────────────────────────────────────────
  function applySyncMessage(receivedTime: number, receivedPlaying: boolean, msgTimestamp: number) {
    const vid = videoRef.current;
    if (!vid) return;

    setBroadcastTC(receivedTime);
    lastSyncRef.current = { time: receivedTime, timestamp: msgTimestamp, playing: receivedPlaying };

    const drift = Math.abs(vid.currentTime - receivedTime);
    setSyncStatus(drift > 1 ? "SYNCING" : "SYNCHRONIZED");
    setSyncDriftMs(Math.round((vid.currentTime - receivedTime) * 1000));

    if (drift > 0.5) vid.currentTime = receivedTime;

    if (receivedPlaying && vid.paused) {
      vid.play().catch(() => setNeedsInteraction(true));
    } else if (!receivedPlaying && !vid.paused) {
      vid.pause();
    }
  }

  // Compute live drift for display
  useEffect(() => {
    if (role !== "listener") return;
    const interval = setInterval(() => {
      const vid = videoRef.current;
      const last = lastSyncRef.current;
      if (!vid || !last) return;
      const elapsed = (Date.now() - last.timestamp) / 1000;
      const expected = last.playing ? last.time + elapsed : last.time;
      setSyncDriftMs(Math.round((vid.currentTime - expected) * 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [role]);

  // ── Broadcaster sync ──────────────────────────────────────────────────────
  const broadcastSync = useCallback(
    (force = false) => {
      if (role !== "broadcaster" || !videoRef.current) return;
      const now = Date.now();
      if (!force && now - lastSyncSent.current < 1500) return;
      lastSyncSent.current = now;
      const payload = {
        type: "sync",
        isPlaying: !videoRef.current.paused,
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration || 0,
        timestamp: now,
      };
      // Send via WebRTC data channels to connected P2P listeners
      broadcastViaPeers(payload);
      // Always also send via WebSocket (catches listeners without P2P)
      sendMessage(payload);
    },
    [role, sendMessage, broadcastViaPeers]
  );

  // ── Video events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTimeUpdate = () => {
      setCurrentTime(vid.currentTime);
      if (role === "broadcaster") broadcastSync();
    };
    const onPlay = () => { setIsPlaying(true); if (role === "broadcaster") broadcastSync(true); };
    const onPause = () => { setIsPlaying(false); if (role === "broadcaster") broadcastSync(true); };
    const onMeta = () => setDuration(vid.duration);
    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("loadedmetadata", onMeta);
    return () => {
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("loadedmetadata", onMeta);
    };
  }, [role, broadcastSync]);

  useEffect(() => { if (!isConnected) setSyncStatus("LOST"); }, [isConnected]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (!videoRef.current) return;
    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      if (role === "broadcaster") broadcastSync(true);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
      if (needsInteraction) { videoRef.current.play().catch(() => {}); setNeedsInteraction(false); }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const isBroadcaster = role === "broadcaster";
  const driftAbs = Math.abs(syncDriftMs);
  const driftColor = driftAbs < 100 ? "text-accent" : driftAbs < 500 ? "text-yellow-400" : "text-destructive";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full aspect-video bg-black border-4 group",
        isBroadcaster ? "border-primary" : "border-border"
      )}
    >
      {/* ── Top status bar ── */}
      <div className="absolute top-3 left-3 right-3 flex justify-between z-20 pointer-events-none">
        <div className="flex items-center gap-2 bg-black/70 px-3 py-1 border border-border backdrop-blur-sm">
          <div className={cn("w-2.5 h-2.5 rounded-full", isConnected ? "bg-accent animate-pulse shadow-[0_0_8px_currentColor]" : "bg-destructive")} />
          <span className="font-display tracking-widest text-base">
            {isConnected ? "UPLINK ESTABLISHED" : "UPLINK SEVERED"}
          </span>
          {hasP2P && (
            <span className="ml-2 text-xs font-sans bg-accent/20 text-accent border border-accent px-1.5 py-0.5 tracking-wider">
              P2P•{connectedPeers.length}
            </span>
          )}
        </div>

        {isBroadcaster ? (
          <div className="flex items-center gap-2 bg-primary/20 text-primary px-3 py-1 border border-primary glow-text-red">
            <Radio className="w-4 h-4 animate-pulse" />
            <span className="font-display text-base tracking-widest">LIVE • {listenerCount} RECV</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="bg-black/70 text-muted-foreground px-3 py-1 border border-border font-display text-base tracking-widest">
              {latency}ms
            </div>
            <div className={cn(
              "px-3 py-1 border font-display text-base tracking-widest",
              syncStatus === "SYNCHRONIZED" ? "bg-accent/20 text-accent border-accent" :
              syncStatus === "SYNCING" ? "bg-black/70 text-foreground border-border" :
              "bg-destructive/20 text-destructive border-destructive"
            )}>
              {syncStatus}
            </div>
          </div>
        )}
      </div>

      {/* ── Timecode overlay (center-right) ── */}
      <div className="absolute top-14 right-3 z-20 pointer-events-none">
        <div className="bg-black/80 border border-border px-3 py-2 font-mono text-right">
          <div className="text-xs text-muted-foreground tracking-widest uppercase mb-0.5">
            {isBroadcaster ? "TC SOURCE" : "TC LOCAL"}
          </div>
          <div className="text-xl font-display tracking-widest text-primary glow-text-red">
            {formatTC(currentTime)}
          </div>
          {!isBroadcaster && lastSyncRef.current && (
            <>
              <div className="text-xs text-muted-foreground tracking-widest uppercase mt-1 mb-0.5">TC BROADCAST</div>
              <div className="text-base font-display tracking-widest text-foreground">
                {formatTC(broadcastTC)}
              </div>
              <div className={cn("text-xs font-sans tracking-wider mt-1", driftColor)}>
                DRIFT {syncDriftMs >= 0 ? "+" : ""}{syncDriftMs}ms
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Video element ── */}
      <video
        ref={videoRef}
        src={url}
        className={cn("w-full h-full object-contain filter contrast-125 saturate-150", !isBroadcaster && "pointer-events-none")}
        playsInline
      />

      {/* ── Autoplay interaction overlay ── */}
      {needsInteraction && role === "listener" && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30">
          <AlertTriangle className="w-14 h-14 text-primary animate-pulse mb-4" />
          <h2 className="text-3xl text-primary glow-text-red mb-6">SIGNAL INTERCEPTED</h2>
          <RetroButton onClick={toggleMute}>INITIALIZE AUDIO & VIDEO</RetroButton>
        </div>
      )}

      {/* ── Debug Panel ── */}
      {showDebug && (
        <div className="absolute inset-0 z-40 bg-black/90 p-4 overflow-y-auto font-sans text-xs">
          <div className="flex justify-between items-center mb-4 border-b border-border pb-2">
            <span className="text-primary font-display text-xl tracking-widest glow-text-red">◈ NETWORK DEBUG CONSOLE</span>
            <button onClick={() => setShowDebug(false)} className="text-muted-foreground hover:text-primary">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* WebSocket Status */}
            <div className="border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-accent mb-2">
                <Wifi className="w-4 h-4" /><span className="font-display tracking-widest text-base">WEBSOCKET</span>
              </div>
              <Row label="STATUS" value={isConnected ? "CONNECTED" : "DISCONNECTED"} valueClass={isConnected ? "text-accent" : "text-destructive"} />
              <Row label="LATENCY" value={`${latency}ms one-way`} />
              <Row label="MY WS ID" value={myWsId.slice(0, 8) + "…" || "—"} />
              <Row label="SESSION" value={sessionId} />
              <Row label="ROLE" value={role.toUpperCase()} />
              {connectedSince && <Row label="UPTIME" value={formatUptime(Date.now() - connectedSince)} />}
              {isBroadcaster && <Row label="LISTENERS" value={String(listenerCount)} />}
            </div>

            {/* WebRTC Status */}
            <div className="border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-accent mb-2">
                <Cpu className="w-4 h-4" /><span className="font-display tracking-widest text-base">WEBRTC P2P</span>
              </div>
              <Row label="P2P ACTIVE" value={hasP2P ? "YES" : "NO"} valueClass={hasP2P ? "text-accent" : "text-muted-foreground"} />
              <Row label="CONNECTED PEERS" value={String(connectedPeers.length)} />
              {peerInfos.length === 0 && (
                <p className="text-muted-foreground italic mt-2">No peers yet. {role === "listener" ? "Awaiting broadcaster acceptance…" : "Waiting for listeners to connect…"}</p>
              )}
              {peerInfos.map((p) => (
                <div key={p.id} className="border border-border/50 p-2 mt-2 space-y-1">
                  <div className="text-foreground font-display tracking-wider">
                    PEER {p.id === "broadcaster" ? "BROADCASTER" : p.id.slice(0, 8) + "…"}
                  </div>
                  <Row label="ICE" value={p.iceState.toUpperCase()} valueClass={p.isConnected ? "text-accent" : "text-yellow-400"} />
                  <Row label="DATA CH" value={p.channelState.toUpperCase()} valueClass={p.channelState === "open" ? "text-accent" : "text-muted-foreground"} />
                </div>
              ))}
            </div>

            {/* STUN Servers */}
            <div className="border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-accent mb-2">
                <Signal className="w-4 h-4" /><span className="font-display tracking-widest text-base">STUN SERVERS</span>
              </div>
              <p className="text-muted-foreground mb-2 text-xs">Used for NAT traversal &amp; peer discovery</p>
              {STUN_SERVERS.map((s) => (
                <div key={s.urls} className="text-foreground font-mono text-xs py-0.5 border-b border-border/30">
                  {s.urls}
                </div>
              ))}
            </div>

            {/* Sync Stats */}
            <div className="border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-accent mb-2">
                <Clock className="w-4 h-4" /><span className="font-display tracking-widest text-base">SYNC DIAGNOSTICS</span>
              </div>
              <Row label="TC LOCAL" value={formatTC(currentTime)} />
              {!isBroadcaster && (
                <>
                  <Row label="TC BROADCAST" value={formatTC(broadcastTC)} />
                  <Row
                    label="DRIFT"
                    value={`${syncDriftMs >= 0 ? "+" : ""}${syncDriftMs}ms`}
                    valueClass={driftColor}
                  />
                  <Row
                    label="DRIFT STATUS"
                    value={driftAbs < 100 ? "EXCELLENT" : driftAbs < 500 ? "ACCEPTABLE" : "HIGH DRIFT"}
                    valueClass={driftColor}
                  />
                </>
              )}
              <Row label="SYNC STATE" value={syncStatus} valueClass={
                syncStatus === "SYNCHRONIZED" ? "text-accent" :
                syncStatus === "SYNCING" ? "text-yellow-400" : "text-destructive"
              } />
              <Row label="TRANSPORT" value={hasP2P ? "WebRTC P2P + WS" : "WebSocket"} />
            </div>
          </div>
        </div>
      )}

      {/* ── Scanlines ── */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-30 z-10" />

      {/* ── Controls bar ── */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 transition-opacity duration-300 z-20",
        (isPlaying && isBroadcaster) ? "opacity-0 group-hover:opacity-100" : "opacity-100"
      )}>
        <div className="flex flex-col gap-2">
          {/* Timeline */}
          <div className="flex items-center gap-3">
            <span className="text-primary font-mono text-sm w-10 shrink-0">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              disabled={!isBroadcaster}
              className={cn("retro-slider flex-1", !isBroadcaster && "opacity-40 grayscale cursor-not-allowed")}
            />
            <span className="text-primary font-mono text-sm w-10 text-right shrink-0">{formatTime(duration)}</span>
          </div>

          {/* Buttons row */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {isBroadcaster && (
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 flex items-center justify-center bg-primary/20 text-primary border border-primary hover:bg-primary/50 transition-all"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
              )}
              <button
                onClick={toggleMute}
                className="w-10 h-10 flex items-center justify-center bg-black/50 border border-border hover:bg-white/10 transition-all text-foreground"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex gap-2">
              {/* Debug toggle */}
              <button
                onClick={() => setShowDebug((v) => !v)}
                className={cn(
                  "w-10 h-10 flex items-center justify-center border transition-all",
                  showDebug
                    ? "bg-accent/20 text-accent border-accent"
                    : "bg-black/50 border-border hover:bg-white/10 text-muted-foreground"
                )}
                title="Toggle Network Debug"
              >
                <Bug className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="w-10 h-10 flex items-center justify-center bg-black/50 border border-border hover:bg-white/10 transition-all text-foreground"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-muted-foreground tracking-wider shrink-0">{label}</span>
      <span className={cn("text-right font-mono break-all", valueClass ?? "text-foreground")}>{value}</span>
    </div>
  );
}
