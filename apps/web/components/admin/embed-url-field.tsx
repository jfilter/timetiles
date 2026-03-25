/**
 * Embed URL field for the Views collection admin sidebar.
 *
 * Displays the embed URL and a copyable iframe snippet for the current view.
 * Only shown for saved views (with an ID and slug).
 *
 * Note: Uses inline styles because Tailwind is not available
 * in the Payload admin panel context.
 *
 * @module
 * @category Admin Components
 */
"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useTranslations } from "next-intl";
import React, { useCallback, useState } from "react";

const styles = {
  container: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" },
  label: { display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" } as const,
  input: {
    width: "100%",
    padding: "6px 8px",
    fontSize: "12px",
    fontFamily: "monospace",
    border: "1px solid #e2e8f0",
    borderRadius: "4px",
    background: "#fff",
    color: "#334155",
    marginBottom: "12px",
    boxSizing: "border-box" as const,
  },
  textarea: {
    width: "100%",
    padding: "6px 8px",
    fontSize: "11px",
    fontFamily: "monospace",
    border: "1px solid #e2e8f0",
    borderRadius: "4px",
    background: "#fff",
    color: "#334155",
    marginBottom: "8px",
    resize: "vertical" as const,
    minHeight: "80px",
    boxSizing: "border-box" as const,
  },
  button: {
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 500,
    border: "1px solid #e2e8f0",
    borderRadius: "4px",
    background: "#fff",
    color: "#334155",
    cursor: "pointer",
    width: "100%",
  },
  success: {
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 500,
    border: "1px solid #86efac",
    borderRadius: "4px",
    background: "#f0fdf4",
    color: "#166534",
    width: "100%",
    textAlign: "center" as const,
  },
  hint: { fontSize: "11px", color: "#94a3b8", margin: "0" },
};

export const EmbedUrlField: React.FC = () => {
  const t = useTranslations("Admin");
  const { id } = useDocumentInfo();
  const slug = useFormFields(([fields]) => fields.slug?.value as string | undefined);
  const [copied, setCopied] = useState(false);

  const embedUrl = typeof window !== "undefined" && slug ? `${window.location.origin}/embed/${slug}` : "";

  const iframeCode = embedUrl
    ? `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" style="border: none; border-radius: 8px;" allow="geolocation" loading="lazy"></iframe>`
    : "";

  const handleCopy = useCallback(() => {
    if (!iframeCode) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(iframeCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API may fail in non-HTTPS contexts — select the textarea as fallback
        const textarea = document.querySelector<HTMLTextAreaElement>("textarea[readonly]");
        textarea?.select();
      }
    })();
  }, [iframeCode]);

  if (!id || !slug) {
    return (
      <div style={styles.container}>
        <p style={styles.hint}>{t("embedSaveHint")}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <span style={styles.label}>{t("embedUrl")}</span>
      <input style={styles.input} readOnly value={embedUrl} onFocus={(e) => e.target.select()} />

      <span style={styles.label}>{t("iframeCode")}</span>
      <textarea style={styles.textarea} readOnly value={iframeCode} onFocus={(e) => e.target.select()} />

      {copied ? (
        <div style={styles.success}>{t("copied")}</div>
      ) : (
        <button type="button" style={styles.button} onClick={handleCopy}>
          {t("copyIframeCode")}
        </button>
      )}
    </div>
  );
};
