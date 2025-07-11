"use client";

import React, { useState } from "react";
import { Button } from "@workspace/ui/components/button";

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

export const GeocodingTestPanel: React.FC<GeocodingTestPanelProps> = ({
  testAddress: initialTestAddress,
  onTest,
}) => {
  const [testAddress, setTestAddress] = useState(initialTestAddress);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResults | null>(null);

  const handleTest = async () => {
    if (!testAddress.trim()) return;

    setTesting(true);
    try {
      const testResults = await onTest(testAddress);
      setResults(testResults);
    } catch (error) {
      console.error("Test failed:", error);
    } finally {
      setTesting(false);
    }
  };

  const renderResult = (providerName: string, result: TestResult | undefined) => {
    if (!result) {
      return (
        <div className="text-gray-500 text-sm">
          Not configured or not tested
        </div>
      );
    }

    if (result.success && result.result) {
      return (
        <div className="space-y-1">
          <div className="text-green-600 font-medium">✓ Success</div>
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
          <div className="text-red-600 font-medium">✗ Failed</div>
          <div className="text-sm text-red-500">
            {result.error || "Unknown error"}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Test Geocoding Configuration
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Test your geocoding providers with a sample address to verify they&apos;re working correctly.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="test-address" className="block text-sm font-medium text-gray-700 mb-1">
            Test Address
          </label>
          <div className="flex space-x-2">
            <input
              id="test-address"
              type="text"
              value={testAddress}
              onChange={(e) => setTestAddress(e.target.value)}
              placeholder="Enter an address to test..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <Button
              onClick={handleTest}
              disabled={testing || !testAddress.trim()}
              className="px-4 py-2"
            >
              {testing ? "Testing..." : "Test All"}
            </Button>
          </div>
        </div>

        {results && (
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Test Results:</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 border border-gray-200 rounded-md bg-white">
                <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                  <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                  Google Maps
                </h5>
                {renderResult("Google", results.google)}
              </div>

              <div className="p-3 border border-gray-200 rounded-md bg-white">
                <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                  Nominatim
                </h5>
                {renderResult("Nominatim", results.nominatim)}
              </div>

              <div className="p-3 border border-gray-200 rounded-md bg-white">
                <h5 className="font-medium text-gray-900 mb-2 flex items-center">
                  <span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
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