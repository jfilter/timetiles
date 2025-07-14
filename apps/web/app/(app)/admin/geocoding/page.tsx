import React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPayload } from "payload";
import config from "../../../../payload.config";
import { GeocodingTestPanel } from "../../../../lib/components/GeocodingTestPanel";
import { ProviderPriorityList } from "../../../../lib/components/ProviderPriorityList";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = 'force-dynamic';

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
  const { GeocodingService } = await import("../../../../lib/services/geocoding/GeocodingService");
  
  const service = new GeocodingService(payload);
  return service.testConfiguration(address);
}

export default async function GeocodingAdminPage() {
  const providers = await getProviders();
  
  // Transform providers to display format
  const providerData = providers.map(provider => ({
    type: provider.type as "google" | "nominatim" | "opencage",
    name: provider.name,
    enabled: provider.enabled || false,
    priority: provider.priority,
    color: provider.type === "google" ? "blue" : provider.type === "nominatim" ? "green" : "orange",
  })).sort((a, b) => a.priority - b.priority);

  const enabledProviders = providerData.filter(p => p.enabled);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Geocoding Configuration
        </h1>
        <p className="text-gray-600">
          Configure and manage your geocoding providers. Test configurations and set provider priorities.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Configuration */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Provider Settings
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Configure individual geocoding providers. Visit the{" "}
              <Link 
                href="/admin/collections/geocoding-providers" 
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Geocoding Providers
              </Link>{" "}
              to manage API keys and detailed configuration.
            </p>
            
            <ProviderPriorityList
              providers={providerData}
              onReorder={async () => {
                "use server";
                // This would be implemented with a server action
                // For now, redirect to the admin panel
                redirect("/admin/collections/geocoding-providers");
              }}
              onToggle={async () => {
                "use server";
                // This would be implemented with a server action
                // For now, redirect to the admin panel
                redirect("/admin/collections/geocoding-providers");
              }}
            />
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Active Providers
            </h2>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                {enabledProviders.length} of {providerData.length} providers enabled
              </div>
              {enabledProviders.length > 0 ? (
                enabledProviders.map(provider => (
                  <div key={provider.type} className="flex justify-between items-center">
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

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              Quick Start Guide
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>1. Add providers in the Geocoding Providers collection</li>
              <li>2. Configure API keys for each provider</li>
              <li>3. Enable and set priorities for providers</li>
              <li>4. Test your configuration with sample addresses</li>
            </ul>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              Provider Information
            </h3>
            <div className="text-sm text-gray-600 space-y-2">
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