import { useRoute, useLocation } from "wouter";
import { useGetSession } from "@workspace/api-client-react";
import { RetroPanel } from "@/components/ui/retro-panel";
import { RetroButton } from "@/components/ui/retro-button";
import { MediaPlayer } from "@/components/video/media-player";
import { Copy, ArrowLeft, TerminalSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Broadcaster() {
  const [, params] = useRoute("/broadcast/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const sessionId = params?.id || "";
  
  const { data: session, isLoading, error } = useGetSession(sessionId, {
    query: {
      retry: 1
    }
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(sessionId);
    toast({
      title: "COPIED TO CLIPBOARD",
      description: "Transmit this frequency code to your party.",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <TerminalSquare className="w-16 h-16 text-primary animate-pulse mb-4" />
        <h2 className="text-4xl text-primary font-display tracking-widest glow-text-red">CONNECTING TO MAINFRAME...</h2>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6">
        <h2 className="text-6xl text-destructive font-display tracking-widest glow-text-red">SIGNAL LOST</h2>
        <p className="text-xl font-sans uppercase">The requested transmission does not exist.</p>
        <RetroButton onClick={() => setLocation("/")} variant="secondary">RETURN TO BASE</RetroButton>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b-2 border-border pb-4">
        <div>
          <button 
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-sans uppercase mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Terminate Session
          </button>
          <h1 className="text-4xl md:text-5xl text-primary glow-text-red m-0 leading-none">
            CONTROL TERMINAL
          </h1>
          <p className="text-muted-foreground font-sans uppercase mt-2">
            OPERATIVE: <span className="text-foreground">{session.broadcasterName}</span>
          </p>
        </div>

        <RetroPanel className="p-4" variant="danger">
          <p className="text-xs text-primary mb-1 uppercase font-sans">Transmission Code:</p>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-display tracking-widest text-white glow-text">{sessionId}</span>
            <button 
              onClick={handleCopy}
              className="p-2 bg-primary/20 hover:bg-primary/50 text-primary border border-primary transition-colors"
              title="Copy Code"
            >
              <Copy className="w-5 h-5" />
            </button>
          </div>
        </RetroPanel>
      </header>

      <main className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <MediaPlayer 
            url={session.videoUrl || ""} 
            role="broadcaster" 
            sessionId={sessionId}
          />
          <div className="bg-secondary/50 border border-border p-4 font-sans text-sm text-muted-foreground">
            <p className="uppercase text-primary animate-pulse mb-2">{">"} SYSTEM STATUS: BROADCASTING ACTIVE</p>
            <p>{">"} ALL PLAYBACK ACTIONS ARE SYNCED TO CONNECTED RECEIVERS INSTANTANEOUSLY.</p>
            <p>{">"} AWAITING FURTHER COMMANDS...</p>
          </div>
        </div>

        <div className="space-y-6">
          <RetroPanel title="Diagnostics" className="h-full">
            <div className="space-y-6 font-sans">
              
              <div>
                <p className="text-muted-foreground uppercase text-xs mb-1">Network Status</p>
                <div className="flex items-center gap-2 text-accent">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
                  <span className="tracking-wider">SECURE UPLINK</span>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-muted-foreground uppercase text-xs mb-1">Time Elapsed</p>
                <p className="text-2xl font-display tracking-widest text-foreground">
                  {new Date().toISOString().substr(11, 8)}
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-muted-foreground uppercase text-xs mb-1">Security Level</p>
                <p className="text-xl font-display text-destructive glow-text-red">CLASSIFIED - DO NOT DISTRIBUTE</p>
              </div>

            </div>
          </RetroPanel>
        </div>
      </main>
      
    </div>
  );
}
