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

import React, { useCallback, useState } from "react";

interface TestResult {
  success: boolean;
  result?: {
    latitude: number;
    longitude: number;
    confidence: number;
    normalizedAddress: string;
  };
  error?: string;
}

interface TestResults {
  google?: TestResult;
  nominatim?: TestResult;
  opencage?: TestResult;
}

// Styles defined outside component to satisfy react-perf/jsx-no-new-object-as-prop
const styles = {
  container: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "24px",
  },
  title: {
    margin: "0 0 8px 0",
    fontSize: "16px",
    fontWeight: 600,
  },
  description: {
    margin: "0 0 16px 0",
    fontSize: "13px",
    color: "#666",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
  },
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
  resultsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px",
  },
  resultCard: {
    background: "white",
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px",
  },
  dotGoogle: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#3b82f6",
    display: "block",
  },
  dotNominatim: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#22c55e",
    display: "block",
  },
  dotOpencage: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#f97316",
    display: "block",
  },
  providerName: {
    fontWeight: 500,
    fontSize: "14px",
  },
  notConfigured: {
    color: "#666",
    fontSize: "13px",
  },
  resultText: {
    fontSize: "13px",
  },
  successText: {
    color: "#22c55e",
    fontWeight: 500,
  },
  failedText: {
    color: "#ef4444",
    fontWeight: 500,
  },
  coordsText: {
    color: "#666",
    marginTop: "4px",
  },
  grayText: {
    color: "#666",
  },
} as const;

const ResultDisplay = ({ result }: { result: TestResult | undefined }) => {
  if (!result) {
    return <span style={styles.notConfigured}>Not configured</span>;
  }

  if (result.success && result.result) {
    return (
      <div style={styles.resultText}>
        <div style={styles.successText}>Success</div>
        <div style={styles.coordsText}>
          {result.result.latitude.toFixed(6)}, {result.result.longitude.toFixed(6)}
        </div>
        <div style={styles.grayText}>Confidence: {(result.result.confidence * 100).toFixed(0)}%</div>
      </div>
    );
  }

  return (
    <div style={styles.resultText}>
      <div style={styles.failedText}>Failed</div>
      <div style={styles.grayText}>{result.error ?? "Unknown error"}</div>
    </div>
  );
};

export const GeocodingTestPanel = () => {
  const [testAddress, setTestAddress] = useState("1600 Amphitheatre Parkway, Mountain View, CA");
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = useCallback(async () => {
    if (!testAddress.trim()) return;

    setTesting(true);
    setError(null);

    try {
      const response = await fetch("/api/geocoding/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testAddress }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Test failed");
      }

      const testResults = (await response.json()) as TestResults;
      setResults(testResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }, [testAddress]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTestAddress(e.target.value);
  }, []);

  const handleButtonClick = useCallback(() => {
    void handleTest();
  }, [handleTest]);

  const buttonStyle = testing ? styles.buttonDisabled : styles.buttonEnabled;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Test Geocoding</h3>
      <p style={styles.description}>Test your geocoding providers with a sample address.</p>

      <div style={styles.inputRow}>
        <input
          type="text"
          value={testAddress}
          onChange={handleInputChange}
          placeholder="Enter an address..."
          style={styles.input}
        />
        <button onClick={handleButtonClick} disabled={testing || !testAddress.trim()} style={buttonStyle}>
          {testing ? "Testing..." : "Test"}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {results && (
        <div style={styles.resultsGrid}>
          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <span style={styles.dotGoogle} />
              <span style={styles.providerName}>Google</span>
            </div>
            <ResultDisplay result={results.google} />
          </div>

          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <span style={styles.dotNominatim} />
              <span style={styles.providerName}>Nominatim</span>
            </div>
            <ResultDisplay result={results.nominatim} />
          </div>

          <div style={styles.resultCard}>
            <div style={styles.resultHeader}>
              <span style={styles.dotOpencage} />
              <span style={styles.providerName}>OpenCage</span>
            </div>
            <ResultDisplay result={results.opencage} />
          </div>
        </div>
      )}
    </div>
  );
};

export default GeocodingTestPanel;
