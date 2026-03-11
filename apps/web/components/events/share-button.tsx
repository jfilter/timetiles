/**
 * Share button with clipboard and native share support.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { Check, Copy, Loader2, Share2 } from "lucide-react";
import { useCallback, useState } from "react";

/** Share button that copies current URL to clipboard or uses native share on mobile */
export const ShareButton = ({ title }: { title: string }) => {
  const [shareState, setShareState] = useState<"idle" | "copying" | "copied" | "error">("idle");

  const handleShare = useCallback(() => {
    const performShare = async () => {
      setShareState("copying");
      try {
        const url = window.location.href;

        if (navigator.share && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          await navigator.share({ title, url });
          setShareState("idle");
          return;
        }

        await navigator.clipboard.writeText(url);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          setShareState("error");
          setTimeout(() => setShareState("idle"), 2000);
        } else {
          setShareState("idle");
        }
      }
    };

    void performShare();
  }, [title]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="hover:bg-muted"
      onClick={handleShare}
      disabled={shareState === "copying"}
      aria-label={shareState === "copied" ? "Link copied" : "Share event"}
    >
      {shareState === "copying" && <Loader2 className="h-5 w-5 animate-spin" />}
      {shareState === "copied" && <Check className="text-cartographic-forest h-5 w-5" />}
      {shareState === "error" && <Copy className="text-destructive h-5 w-5" />}
      {shareState === "idle" && <Share2 className="h-5 w-5" />}
    </Button>
  );
};
