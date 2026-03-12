import { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RetroPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  title?: string;
  variant?: "default" | "danger" | "success";
}

export function RetroPanel({ children, title, variant = "default", className, ...props }: RetroPanelProps) {
  return (
    <div 
      className={cn(
        "relative border-2 bg-card/80 backdrop-blur-sm p-6 overflow-visible",
        variant === "default" && "border-primary glow-box-red",
        variant === "danger" && "border-destructive glow-box-red",
        variant === "success" && "border-accent glow-box",
        className
      )}
      {...props}
    >
      {/* Decorative corners */}
      <div className={cn("absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2", 
        variant === "default" ? "border-primary" : variant === "danger" ? "border-destructive" : "border-accent"
      )} />
      <div className={cn("absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2", 
        variant === "default" ? "border-primary" : variant === "danger" ? "border-destructive" : "border-accent"
      )} />
      <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2", 
        variant === "default" ? "border-primary" : variant === "danger" ? "border-destructive" : "border-accent"
      )} />
      <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2", 
        variant === "default" ? "border-primary" : variant === "danger" ? "border-destructive" : "border-accent"
      )} />

      {title && (
        <div className="absolute -top-3 left-4 bg-background px-2">
          <h3 className={cn(
            "text-xl glow-text uppercase tracking-widest m-0 leading-none",
            variant === "default" && "text-primary glow-text-red",
            variant === "danger" && "text-destructive glow-text-red",
            variant === "success" && "text-accent"
          )}>
            {title}
          </h3>
        </div>
      )}
      
      <div className={cn("relative z-10", title && "mt-4")}>
        {children}
      </div>
    </div>
  );
}
