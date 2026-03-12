import { useRoute, useLocation } from "wouter";
import { useGetSession } from "@workspace/api-client-react";
import { RetroPanel } from "@/components/ui/retro-panel";
import { RetroButton } from "@/components/ui/retro-button";
import { MediaPlayer } from "@/components/video/media-player";
import { ArrowLeft, TerminalSquare } from "lucide-react";

export default function Listener() {
  const [, params] = useRoute("/watch/:id");
  const [, setLocation] = useLocation();
  
  const sessionId = params?.id || "";
  
  const { data: session, isLoading, error } = useGetSession(sessionId, {
    query: {
      retry: 1
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <TerminalSquare className="w-16 h-16 text-accent animate-pulse mb-4" />
        <h2 className="text-4xl text-accent font-display tracking-widest">SEARCHING FREQUENCIES...</h2>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6">
        <h2 className="text-6xl text-destructive font-display tracking-widest glow-text-red">STATIC DETECTED</h2>
        <p className="text-xl font-sans uppercase">No transmission found on this frequency.</p>
        <RetroButton onClick={() => setLocation("/")} variant="secondary">TUNE TO NEW FREQUENCY</RetroButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 max-w-6xl mx-auto flex flex-col">
      
      <header className="flex justify-between items-end gap-4 border-b-2 border-border pb-4">
        <div>
          <button 
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors font-sans uppercase mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Disconnect
          </button>
          <h1 className="text-4xl md:text-5xl text-accent m-0 leading-none">
            RECEIVER TERMINAL
          </h1>
          <p className="text-muted-foreground font-sans uppercase mt-2">
            SOURCE: <span className="text-foreground">{session.broadcasterName}</span>
          </p>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-6">
        <div className="w-full bg-black/50 p-2 border-2 border-border">
          <MediaPlayer 
            url={session.videoUrl || ""} 
            role="listener" 
            sessionId={sessionId}
          />
        </div>
        
        <RetroPanel title="Terminal Output" variant="success" className="w-full flex-1 min-h-[150px]">
          <div className="font-sans text-sm text-muted-foreground space-y-1">
            <p className="text-accent uppercase animate-pulse mb-4">{">"} FREQUENCY LOCKED. WAITING FOR SOURCE SYNC...</p>
            <p>{">"} CAUTION: DO NOT ATTEMPT TO ALTER PLAYBACK.</p>
            <p>{">"} CONTROLS ARE LOCKED TO SOURCE <span className="text-foreground">[{session.broadcasterName}]</span>.</p>
            <p>{">"} MAINTAINING CONNECTION TO HAWKINS NETWORK SECURE SERVER...</p>
          </div>
        </RetroPanel>
      </main>
      
    </div>
  );
}
