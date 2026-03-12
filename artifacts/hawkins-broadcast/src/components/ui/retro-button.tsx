import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface RetroButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export const RetroButton = forwardRef<HTMLButtonElement, RetroButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "relative px-6 py-3 font-display text-2xl tracking-widest uppercase transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none group",
          variant === "primary" && "bg-primary text-primary-foreground border-2 border-primary-foreground shadow-[0_0_15px_var(--color-primary)] hover:bg-primary/80 hover:shadow-[0_0_25px_var(--color-primary)]",
          variant === "secondary" && "bg-secondary text-secondary-foreground border-2 border-primary hover:bg-primary/20",
          variant === "danger" && "bg-destructive text-destructive-foreground border-2 border-white shadow-[0_0_15px_var(--color-destructive)] hover:bg-destructive/80",
          variant === "ghost" && "bg-transparent text-foreground border-2 border-transparent hover:border-primary hover:text-primary hover:bg-primary/10",
          className
        )}
        {...props}
      >
        <span className="relative z-10">{props.children}</span>
        {/* Hover scanline effect internal to button */}
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </button>
    );
  }
);
RetroButton.displayName = "RetroButton";
