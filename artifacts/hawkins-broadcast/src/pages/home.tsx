import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateSession } from "@workspace/api-client-react";
import { RetroPanel } from "@/components/ui/retro-panel";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RadioTower, SatelliteDish } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4";

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Broadcaster Form
  const [broadcasterName, setBroadcasterName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  
  // Listener Form
  const [sessionCode, setSessionCode] = useState("");

  const createMutation = useCreateSession({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "TRANSMISSION INITIALIZED",
          description: `Session code: ${data.id}`,
        });
        setLocation(`/broadcast/${data.id}`);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "INITIALIZATION FAILED",
          description: "Could not connect to mainframe. Try again.",
        });
      }
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcasterName) {
      toast({ variant: "destructive", title: "ERROR", description: "Codename required" });
      return;
    }
    createMutation.mutate({
      data: {
        broadcasterName,
        videoUrl: videoUrl || DEFAULT_VIDEO_URL
      }
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionCode) {
      toast({ variant: "destructive", title: "ERROR", description: "Intercept code required" });
      return;
    }
    setLocation(`/watch/${sessionCode}`);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {/* Background Image Setup */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40 mix-blend-luminosity"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/hawkins-bg.png)` }}
      />
      
      <div className="relative z-10 w-full max-w-5xl mx-auto space-y-12">
        
        <div className="text-center space-y-4">
          <img 
            src={`${import.meta.env.BASE_URL}images/logo.png`} 
            alt="Hawkins Lab Logo" 
            className="w-32 h-32 mx-auto mix-blend-screen opacity-80"
          />
          <h1 className="text-6xl md:text-8xl text-primary glow-text-red">CODE RED</h1>
          <p className="text-2xl text-foreground font-sans tracking-widest uppercase">Emergency Broadcast Terminal v4.0</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          
          {/* Broadcaster Column */}
          <RetroPanel title="Initiate Transmission" className="h-full">
            <form onSubmit={handleCreate} className="space-y-6 flex flex-col h-full">
              <div className="flex items-center gap-4 text-primary mb-2">
                <RadioTower className="w-8 h-8 animate-pulse" />
                <p className="font-sans text-sm uppercase">Primary Control Mode. Establish connection and broadcast signal to listeners.</p>
              </div>

              <div className="space-y-2 flex-1">
                <label className="text-primary font-display tracking-widest text-xl">OPERATIVE CODENAME</label>
                <RetroInput 
                  value={broadcasterName}
                  onChange={(e) => setBroadcasterName(e.target.value)}
                  placeholder="e.g. DUSTIN, EAGLE_ONE"
                  maxLength={20}
                />
              </div>

              <div className="space-y-2 flex-1">
                <label className="text-primary font-display tracking-widest text-xl">VIDEO SOURCE URL (OPTIONAL)</label>
                <RetroInput 
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Leave blank for test pattern"
                />
              </div>

              <RetroButton 
                type="submit" 
                className="w-full mt-auto"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "INITIALIZING..." : "START BROADCAST"}
              </RetroButton>
            </form>
          </RetroPanel>

          {/* Listener Column */}
          <RetroPanel title="Intercept Signal" variant="success" className="h-full">
            <form onSubmit={handleJoin} className="space-y-6 flex flex-col h-full">
              <div className="flex items-center gap-4 text-accent mb-2">
                <SatelliteDish className="w-8 h-8" />
                <p className="font-sans text-sm uppercase">Passive Receiving Mode. Synchronize to an active broadcast channel.</p>
              </div>

              <div className="space-y-2 flex-1 mt-8">
                <label className="text-accent font-display tracking-widest text-xl">TRANSMISSION FREQUENCY CODE</label>
                <RetroInput 
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value)}
                  placeholder="ENTER SESSION ID"
                  className="border-accent focus:border-accent focus:shadow-[0_0_10px_var(--color-accent)]"
                />
              </div>

              <div className="flex-1" />

              <RetroButton 
                type="submit" 
                variant="ghost"
                className="w-full mt-auto text-accent border-accent hover:bg-accent/20 hover:text-accent hover:border-accent shadow-[0_0_15px_rgba(0,255,0,0.2)]"
              >
                TUNE IN
              </RetroButton>
            </form>
          </RetroPanel>

        </div>
      </div>
    </div>
  );
}
