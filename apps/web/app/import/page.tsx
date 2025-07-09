import ImportUpload from "../../components/ImportUpload";

export default function ImportPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto">
        <div className="mb-8 text-center">
          <h1 className="mb-4 text-4xl font-bold text-gray-900">
            Event Data Import System
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            Upload your event data files (CSV or Excel) and watch them get
            processed, geocoded, and imported into the system with real-time
            progress tracking.
          </p>
        </div>

        <ImportUpload />

        <div className="mx-auto mt-12 max-w-4xl">
          <div className="rounded-lg bg-white p-6 shadow-md">
            <h2 className="mb-4 text-2xl font-bold">
              📋 File Format Requirements
            </h2>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-lg font-semibold text-green-600">
                  ✅ Required Fields
                </h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <strong>title</strong> - Event name/title
                  </li>
                  <li>
                    <strong>date</strong> - Event date (YYYY-MM-DD, MM/DD/YYYY,
                    etc.)
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-semibold text-blue-600">
                  📝 Optional Fields
                </h3>
                <ul className="space-y-2 text-sm">
                  <li>
                    <strong>description</strong> - Event description
                  </li>
                  <li>
                    <strong>enddate</strong> - Event end date
                  </li>
                  <li>
                    <strong>location</strong> - Venue name
                  </li>
                  <li>
                    <strong>address</strong> - Full address (for geocoding)
                  </li>
                  <li>
                    <strong>url</strong> - Event website
                  </li>
                  <li>
                    <strong>category</strong> - Event category
                  </li>
                  <li>
                    <strong>tags</strong> - Comma-separated tags
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <h4 className="mb-2 font-semibold text-yellow-800">💡 Tips</h4>
              <ul className="space-y-1 text-sm text-yellow-700">
                <li>• Include addresses for automatic geocoding</li>
                <li>• Use consistent date formats</li>
                <li>• Maximum file size: 10MB for unauthenticated users</li>
                <li>• Supported formats: CSV, XLSX, XLS</li>
                <li>
                  • Rate limit: 5 uploads per hour for unauthenticated users
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-white p-6 shadow-md">
            <h2 className="mb-4 text-2xl font-bold">🔄 Processing Stages</h2>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                  1
                </div>
                <div>
                  <h3 className="font-semibold">File Parsing</h3>
                  <p className="text-sm text-gray-600">
                    Your file is parsed and validated for required fields
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                  2
                </div>
                <div>
                  <h3 className="font-semibold">Batch Processing</h3>
                  <p className="text-sm text-gray-600">
                    Data is processed in batches for optimal performance
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                  3
                </div>
                <div>
                  <h3 className="font-semibold">Event Creation</h3>
                  <p className="text-sm text-gray-600">
                    Events are created in the database
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                  4
                </div>
                <div>
                  <h3 className="font-semibold">Geocoding</h3>
                  <p className="text-sm text-gray-600">
                    Addresses are geocoded using Google Maps API with
                    OpenStreetMap fallback
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-600">
                  ✓
                </div>
                <div>
                  <h3 className="font-semibold">Completed</h3>
                  <p className="text-sm text-gray-600">
                    All events are imported and ready to use
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
