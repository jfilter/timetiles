/**
 * Textarea component with theme support.
 *
 * Multi-line text input with refined borders and typography. Uses semantic
 * design tokens for theme compatibility across cartographic and other themes.
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";
import * as React from "react";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "border-input flex min-h-[120px] w-full rounded-sm border",
        "bg-background",
        "px-4 py-3",
        "text-foreground text-base",
        "placeholder:text-muted-foreground",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "resize-y",
        "transition-colors duration-200",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
