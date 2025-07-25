import Link from "next/link";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import React from "react";

import { GeocodingTestPanel } from "@/lib/components/geocoding-test-panel";
import { ProviderPriorityList } from "@/lib/components/provider-priority-list";
import config from "@/payload.config";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

function getProviderColor(type: string): string {
  if (type === "google") return "blue";
  if (type === "nominatim") return "green";
  return "orange";
}

async function getProviders() {
  const payload = await getPayload({ config });

  try {
    // Get providers from the collection
    const providers = await payload.find({
      collection: "geocoding-providers",
      limit: 1000,
    });

    return providers.docs;
  } catch {
    // Return empty array if error
    return [];
  }
}

async function testGeocodingConfiguration(address: string) {
  "use server";

  const payload = await getPayload({ config });

  // Import the geocoding service
  const { GeocodingService } = await import("../../../lib/services/geocoding/geocoding-service");

  const service = new GeocodingService(payload);
  return service.testConfiguration(address);
}

export default async function GeocodingAdminPage() {
  const providers = await getProviders();

  // Transform providers to display format
  const providerData = providers
    .map((provider) => ({
      type: provider.type,
      name: provider.name,
      enabled: provider.enabled ?? false,
      priority: provider.priority,
      color: getProviderColor(provider.type),
    }))
    .sort((a, b) => a.priority - b.priority);

  const enabledProviders = providerData.filter((p) => p.enabled);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Geocoding Configuration</h1>
        <p className="text-gray-600">
          Configure and manage your geocoding providers. Test configurations and set provider priorities.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left Column - Configuration */}
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Provider Settings</h2>
            <p className="mb-4 text-sm text-gray-600">
              Configure individual geocoding providers. Visit the{" "}
              <Link
                href="/admin/collections/geocoding-providers"
                className="text-blue-600 underline hover:text-blue-800"
              >
                Geocoding Providers
              </Link>{" "}
              to manage API keys and detailed configuration.
            </p>

            <ProviderPriorityList
              providers={providerData}
              onReorder={() => {
                // This would be implemented with a server action
                // For now, redirect to the admin panel
                redirect("/admin/collections/geocoding-providers");
              }}
              onToggle={() => {
                // This would be implemented with a server action
                // For now, redirect to the admin panel
                redirect("/admin/collections/geocoding-providers");
              }}
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Active Providers</h2>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                {enabledProviders.length} of {providerData.length} providers enabled
              </div>
              {enabledProviders.length > 0 ? (
                enabledProviders.map((provider) => (
                  <div key={provider.type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{provider.name}</span>
                    <span className="text-sm font-medium text-green-600">Active (Priority: {provider.priority})</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-amber-600">
                  No providers are currently enabled. Configure providers to enable geocoding.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Testing */}
        <div className="space-y-6">
          <GeocodingTestPanel
            testAddress="1600 Amphitheatre Parkway, Mountain View, CA"
            onTest={testGeocodingConfiguration}
          />

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h3 className="mb-2 text-sm font-medium text-blue-900">Quick Start Guide</h3>
            <ul className="space-y-1 text-sm text-blue-800">
              <li>1. Add providers in the Geocoding Providers collection</li>
              <li>2. Configure API keys for each provider</li>
              <li>3. Enable and set priorities for providers</li>
              <li>4. Test your configuration with sample addresses</li>
            </ul>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-2 text-sm font-medium text-gray-900">Provider Information</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div>
                <strong>Google Maps:</strong> High accuracy, requires API key
              </div>
              <div>
                <strong>Nominatim:</strong> Free, open-source, rate limited
              </div>
              <div>
                <strong>OpenCage:</strong> Good balance of accuracy and cost
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
