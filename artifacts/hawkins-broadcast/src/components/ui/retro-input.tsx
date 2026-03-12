import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface RetroInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const RetroInput = forwardRef<HTMLInputElement, RetroInputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <input
          ref={ref}
          className={cn(
            "w-full bg-black/50 border-2 border-border p-4 font-sans text-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:shadow-[0_0_10px_var(--color-primary)] transition-all",
            error && "border-destructive focus:border-destructive focus:shadow-[0_0_10px_var(--color-destructive)]",
            className
          )}
          {...props}
        />
        {/* Blinking cursor effect fake when focused */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-6 bg-primary opacity-0 animate-pulse pointer-events-none hidden peer-focus:block" />
        
        {error && (
          <p className="mt-2 text-sm text-destructive font-sans glow-text">{error}</p>
        )}
      </div>
    );
  }
);
RetroInput.displayName = "RetroInput";
