"use client";

import { Button } from "@workspace/ui/components/button";
import React, { useCallback, useState } from "react";

import { logger } from "../logger";

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

interface GeocodingTestPanelProps {
  testAddress: string;
  onTest: (address: string) => Promise<TestResults>;
}

export const GeocodingTestPanel = ({ testAddress: initialTestAddress, onTest }: GeocodingTestPanelProps) => {
  const [testAddress, setTestAddress] = useState(initialTestAddress);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResults | null>(null);

  const handleAddressChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTestAddress(e.target.value);
  }, []);

  const handleTest = useCallback(async () => {
    if (!testAddress.trim()) return;

    setTesting(true);
    try {
      const testResults = await onTest(testAddress);
      setResults(testResults);
    } catch (error) {
      logger.error("Test failed:", error);
    } finally {
      setTesting(false);
    }
  }, [testAddress, onTest]);

  const handleTestClick = useCallback(() => {
    void handleTest();
  }, [handleTest]);

  const renderResult = (providerName: string, result: TestResult | undefined) => {
    if (!result) {
      return <div className="text-sm text-gray-500">Not configured or not tested</div>;
    }

    if (result.success && result.result) {
      return (
        <div className="space-y-1">
          <div className="font-medium text-green-600">✓ Success</div>
          <div className="text-sm text-gray-600">
            <div>Lat: {result.result.latitude.toFixed(6)}</div>
            <div>Lng: {result.result.longitude.toFixed(6)}</div>
            <div>Confidence: {(result.result.confidence * 100).toFixed(1)}%</div>
            <div className="truncate" title={result.result.normalizedAddress}>
              {result.result.normalizedAddress}
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="space-y-1">
          <div className="font-medium text-red-600">✗ Failed</div>
          <div className="text-sm text-red-500">{result.error ?? "Unknown error"}</div>
        </div>
      );
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div>
        <h3 className="mb-2 text-lg font-medium text-gray-900">Test Geocoding Configuration</h3>
        <p className="mb-4 text-sm text-gray-600">
          Test your geocoding providers with a sample address to verify they&apos;re working correctly.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="test-address" className="mb-1 block text-sm font-medium text-gray-700">
            Test Address
          </label>
          <div className="flex space-x-2">
            <input
              id="test-address"
              type="text"
              value={testAddress}
              onChange={handleAddressChange}
              placeholder="Enter an address to test..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
            <Button onClick={handleTestClick} disabled={testing || !testAddress.trim()} className="px-4 py-2">
              {testing ? "Testing..." : "Test All"}
            </Button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Test Results:</h4>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <h5 className="mb-2 flex items-center font-medium text-gray-900">
                  <span className="mr-2 h-3 w-3 rounded-full bg-blue-500"></span>
                  Google Maps
                </h5>
                {renderResult("Google", results.google)}
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-3">
                <h5 className="mb-2 flex items-center font-medium text-gray-900">
                  <span className="mr-2 h-3 w-3 rounded-full bg-green-500"></span>
                  Nominatim
                </h5>
                {renderResult("Nominatim", results.nominatim)}
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-3">
                <h5 className="mb-2 flex items-center font-medium text-gray-900">
                  <span className="mr-2 h-3 w-3 rounded-full bg-orange-500"></span>
                  OpenCage
                </h5>
                {renderResult("OpenCage", results.opencage)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
