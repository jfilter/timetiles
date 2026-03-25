/**
 * Share button with clipboard and native share support.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { Check, Copy, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useClipboard } from "@/lib/hooks/use-clipboard";

/** Share button that copies current URL to clipboard or uses native share on mobile */
export const ShareButton = ({ title }: { title: string }) => {
  const t = useTranslations("Events");
  const { copy, isCopied, error } = useClipboard();

  const handleShare = () => {
    const url = window.location.href;

    // Use native share on mobile if available
    if (navigator.share && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      // oxlint-disable-next-line promise/prefer-await-to-then -- fire-and-forget; AbortError (user canceled) is expected
      void navigator.share({ title, url }).catch(() => {});
      return;
    }

    void copy(url);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="hover:bg-muted"
      onClick={handleShare}
      aria-label={isCopied ? t("linkCopied") : t("shareEvent")}
    >
      {isCopied && <Check className="text-accent h-5 w-5" />}
      {error && <Copy className="text-destructive h-5 w-5" />}
      {!isCopied && !error && <Share2 className="h-5 w-5" />}
    </Button>
  );
};
