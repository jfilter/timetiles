/**
 * Geocoding test panel for Payload admin.
 *
 * Provides an interface to test geocoding providers with sample addresses.
 * Displayed above the geocoding-providers collection list.
 *
 * Note: Uses inline styles because Tailwind is not available
 * in the Payload admin panel context.
 *
 * @module
 * @category Admin Components
 */
"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { adminColors, adminStyles } from "@/lib/constants/admin-styles";
import type { TestResult } from "@/lib/hooks/use-geocoding-test";
import { useGeocodingTest } from "@/lib/hooks/use-geocoding-test";

// Styles defined outside component (Tailwind unavailable in Payload admin panel)
const styles = {
  container: { ...adminStyles.card, marginBottom: "24px" },
  title: { margin: "0 0 8px 0", fontSize: "16px", fontWeight: 600, color: adminColors.text },
  description: { margin: "0 0 16px 0", fontSize: "13px", color: adminColors.textMuted },
  inputRow: { display: "flex", gap: "8px", marginBottom: "16px" },
  input: adminStyles.input,
  buttonEnabled: {
    padding: "8px 16px",
    background: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    cursor: "pointer",
  },
  buttonDisabled: {
    padding: "8px 16px",
    background: "#9ca3af",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    cursor: "not-allowed",
  },
  errorBox: {
    padding: "12px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    color: "#dc2626",
    fontSize: "13px",
    marginBottom: "16px",
  },
  resultsGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" },
  resultCard: adminStyles.cardInset,
  resultHeader: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" },
  dotGoogle: { width: "10px", height: "10px", borderRadius: "50%", background: "#3b82f6", display: "block" },
  dotNominatim: { width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", display: "block" },
  dotOpencage: { width: "10px", height: "10px", borderRadius: "50%", background: "#f97316", display: "block" },
  providerName: { fontWeight: 500, fontSize: "14px", color: adminColors.text },
  notConfigured: { color: adminColors.textMuted, fontSize: "13px" },
  resultText: { fontSize: "13px", color: adminColors.text },
  successText: { color: "#22c55e", fontWeight: 500 },
  failedText: { color: "#ef4444", fontWeight: 500 },
  coordsText: { color: adminColors.textMuted, marginTop: "4px" },
  grayText: { color: adminColors.textMuted },
} as const;

const ResultDisplay = ({ result }: { result: TestResult | undefined }) => {
  const t = useTranslations("Admin");

  if (!result) {
    return <span style={styles.notConfigured}>{t("notConfigured")}</span>;
  }

  if (result.success && result.result) {
    return (
      <div style={styles.resultText}>
        <div style={styles.successText}>{t("success")}</div>
        <div style={styles.coordsText}>
          {result.result.latitude.toFixed(6)}, {result.result.longitude.toFixed(6)}
        </div>
        <div style={styles.grayText}>{t("confidence", { value: (result.result.confidence * 100).toFixed(0) })}</div>
      </div>
    );
  }

  return (
    <div style={styles.resultText}>
      <div style={styles.failedText}>{t("failed")}</div>
      <div style={styles.grayText}>{result.error ?? t("unknownError")}</div>
    </div>
  );
};

export const GeocodingTestPanel = () => {
  const t = useTranslations("Admin");
  const [testAddress, setTestAddress] = useState("1600 Amphitheatre Parkway, Mountain View, CA");
  const { mutate, isPending, data: results, error } = useGeocodingTest();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTestAddress(e.target.value);
  };

  const handleButtonClick = () => {
    void mutate(testAddress);
  };

  const buttonStyle = isPending ? styles.buttonDisabled : styles.buttonEnabled;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{t("testGeocoding")}</h3>
      <p style={styles.description}>{t("testGeocodingDescription")}</p>

      <div style={styles.inputRow}>
        <input
          type="text"
          value={testAddress}
          onChange={handleInputChange}
          placeholder={t("enterAddress")}
          style={styles.input}
        />
        <button onClick={handleButtonClick} disabled={isPending || !testAddress.trim()} style={buttonStyle}>
          {isPending ? t("testing") : t("test")}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {results && (
        <div style={styles.resultsGrid}>
          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <span style={styles.dotGoogle} />
              <span style={styles.providerName}>{t("google")}</span>
            </div>
            <ResultDisplay result={results.google} />
          </div>

          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <span style={styles.dotNominatim} />
              <span style={styles.providerName}>{t("nominatim")}</span>
            </div>
            <ResultDisplay result={results.nominatim} />
          </div>

          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <span style={styles.dotOpencage} />
              <span style={styles.providerName}>{t("opencage")}</span>
            </div>
            <ResultDisplay result={results.opencage} />
          </div>
        </div>
      )}
    </div>
  );
};

export default GeocodingTestPanel;
