import { useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background relative z-10">
      <AlertTriangle className="w-24 h-24 text-destructive animate-pulse mb-8" />
      <h1 className="text-8xl text-destructive font-display tracking-widest glow-text-red mb-4">404</h1>
      <h2 className="text-3xl text-primary font-sans uppercase mb-8">Sector Not Found</h2>
      <p className="text-muted-foreground font-sans max-w-md text-center mb-12 uppercase tracking-wide">
        You have wandered into restricted territory. The coordinates you requested do not exist in the mainframe.
      </p>
      <RetroButton onClick={() => setLocation("/")} variant="primary">
        EVACUATE TO BASE
      </RetroButton>
    </div>
  );
}
