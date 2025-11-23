/**
 * Input component with theme support.
 *
 * Text input with refined borders and typography. Uses semantic design
 * tokens for theme compatibility across cartographic and other themes.
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";
import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "border-input flex h-11 w-full rounded-sm border",
        "bg-background",
        "px-4 py-2",
        "text-foreground text-base",
        "placeholder:text-muted-foreground",
        "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-colors duration-200",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
