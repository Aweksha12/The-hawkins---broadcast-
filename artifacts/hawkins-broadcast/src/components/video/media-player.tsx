import { useRef, useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, AlertTriangle, Radio } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { RetroButton } from "../ui/retro-button";
import { useWebSocket, WsMessage } from "@/hooks/use-websocket";

interface MediaPlayerProps {
  url: string;
  role: "broadcaster" | "listener";
  sessionId: string;
}

export function MediaPlayer({ url, role, sessionId }: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(role === "listener"); // Mute listeners by default to allow autoplay
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"SYNCING" | "SYNCHRONIZED" | "LOST">("SYNCING");

  // Broadcast throttler
  const lastSyncSent = useRef(0);

  // Handle incoming WS messages
  const onWsMessage = (msg: WsMessage) => {
    if (role === "broadcaster") return; // Broadcaster ignores incoming syncs
    
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
      const vid = videoRef.current;
      if (!vid) return;

      const expectedTime = msg.currentTime;
      const drift = Math.abs(vid.currentTime - expectedTime);

      setSyncStatus(drift > 1 ? "SYNCING" : "SYNCHRONIZED");

      // Auto-seek if drift is significant (>0.5s)
      if (drift > 0.5) {
        vid.currentTime = expectedTime;
      }

      // Sync play/pause state
      if (msg.isPlaying && vid.paused) {
        vid.play().catch(() => setNeedsInteraction(true));
      } else if (!msg.isPlaying && !vid.paused) {
        vid.pause();
      }
    }
  };

  const { isConnected, latency, sendMessage, listenerCount } = useWebSocket({
    sessionId,
    role,
    onMessage: onWsMessage
  });

  useEffect(() => {
    if (!isConnected) setSyncStatus("LOST");
  }, [isConnected]);

  // Broadcaster actions
  const broadcastSync = (force = false) => {
    if (role !== "broadcaster" || !videoRef.current) return;
    
    const now = Date.now();
    // Throttle routine syncs to every 1.5s unless forced (play/pause/seek)
    if (!force && now - lastSyncSent.current < 1500) return;
    
    lastSyncSent.current = now;
    sendMessage({
      type: "sync",
      isPlaying: !videoRef.current.paused,
      currentTime: videoRef.current.currentTime,
      timestamp: now
    });
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
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
      if (needsInteraction) {
        videoRef.current.play().catch(() => {});
        setNeedsInteraction(false);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Video Event Listeners
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onTimeUpdate = () => {
      setCurrentTime(vid.currentTime);
      if (role === "broadcaster") broadcastSync();
    };

    const onPlay = () => {
      setIsPlaying(true);
      if (role === "broadcaster") broadcastSync(true);
    };

    const onPause = () => {
      setIsPlaying(false);
      if (role === "broadcaster") broadcastSync(true);
    };

    const onLoadedMetadata = () => setDuration(vid.duration);

    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [role, sendMessage]);

  const isBroadcaster = role === "broadcaster";

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative w-full aspect-video bg-black border-4 group",
        isBroadcaster ? "border-primary" : "border-border"
      )}
    >
      {/* Status Overlay */}
      <div className="absolute top-4 left-4 right-4 flex justify-between z-20 pointer-events-none">
        <div className="flex items-center gap-2 bg-black/60 px-3 py-1 border border-border backdrop-blur-sm">
          <div className={cn("w-3 h-3 rounded-full", isConnected ? "bg-accent shadow-[0_0_10px_var(--color-accent)] animate-pulse" : "bg-destructive")} />
          <span className="font-display tracking-widest text-lg">
            {isConnected ? "UPLINK ESTABLISHED" : "UPLINK SEVERED"}
          </span>
        </div>

        {isBroadcaster ? (
          <div className="flex items-center gap-2 bg-primary/20 text-primary px-3 py-1 border border-primary backdrop-blur-sm glow-text-red">
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="font-display text-lg tracking-widest">LIVE • {listenerCount} RECV</span>
          </div>
        ) : (
          <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-black/60 px-3 py-1 border border-border backdrop-blur-sm">
              <span className="font-display text-lg tracking-widest text-muted-foreground">LATENCY: {latency}ms</span>
            </div>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 border backdrop-blur-sm",
              syncStatus === "SYNCHRONIZED" ? "bg-accent/20 text-accent border-accent" : 
              syncStatus === "SYNCING" ? "bg-secondary/80 text-foreground border-border" : 
              "bg-destructive/20 text-destructive border-destructive"
            )}>
              <span className="font-display text-lg tracking-widest uppercase">{syncStatus}</span>
            </div>
          </div>
        )}
      </div>

      <video
        ref={videoRef}
        src={url}
        className={cn(
          "w-full h-full object-contain filter contrast-125 saturate-150", 
          !isBroadcaster && "pointer-events-none"
        )}
        playsInline
      />

      {/* Interaction required overlay for autoplay policy */}
      {needsInteraction && role === "listener" && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30">
          <AlertTriangle className="w-16 h-16 text-primary animate-pulse mb-4" />
          <h2 className="text-3xl text-primary glow-text-red mb-6">SIGNAL INTERCEPTED</h2>
          <RetroButton onClick={toggleMute}>INITIALIZE AUDIO & VIDEO</RetroButton>
        </div>
      )}

      {/* Controls - visible on hover or if paused, fully interactive only for broadcaster */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-opacity duration-300 z-20",
        (isPlaying && isBroadcaster) ? "opacity-0 group-hover:opacity-100" : "opacity-100"
      )}>
        <div className="flex flex-col gap-2">
          {/* Timeline */}
          <div className="flex items-center gap-4">
            <span className="text-primary font-mono">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              disabled={!isBroadcaster}
              className={cn("retro-slider flex-1", !isBroadcaster && "opacity-50 grayscale cursor-not-allowed")}
            />
            <span className="text-primary font-mono">{formatTime(duration)}</span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-4">
              {isBroadcaster && (
                <button 
                  onClick={togglePlay}
                  className="w-12 h-12 flex items-center justify-center bg-primary/20 text-primary border border-primary hover:bg-primary/40 hover:shadow-[0_0_15px_var(--color-primary)] transition-all"
                >
                  {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                </button>
              )}
              
              <button 
                onClick={toggleMute}
                className="w-12 h-12 flex items-center justify-center bg-black/50 border border-border hover:bg-white/10 transition-all text-foreground"
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </button>
            </div>

            <button 
              onClick={toggleFullscreen}
              className="w-12 h-12 flex items-center justify-center bg-black/50 border border-border hover:bg-white/10 transition-all text-foreground"
            >
              <Maximize />
            </button>
          </div>
        </div>
      </div>
      
      {/* Decorative scanline specific to video */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-30 z-10" />
    </div>
  );
}
