import { TopMenuBar } from "@/components/TopMenuBar";
import { Button } from "@workspace/ui/components/button";

export default function Page() {
  return (
    <>
      <TopMenuBar />
      <main className="flex min-h-svh flex-col items-center justify-center px-4 pt-32">
        {/* Hero Section */}
        <section className="flex max-w-2xl flex-col items-center gap-6 text-center">
          <h1 className="from-primary to-secondary bg-gradient-to-r bg-clip-text text-5xl font-extrabold leading-tight tracking-tight text-transparent">
            Explore Your Geodata with TimeTiles
          </h1>
          <p className="text-muted-foreground text-lg">
            Visualize, analyze, and interact with your spatial and temporal data
            like never before. TimeTiles lets you map, filter, and discover
            patterns in your geodata, making it easy to turn raw location data
            into actionable insights.
          </p>
          <Button size="lg" className="mt-2">
            Start Exploring
          </Button>
        </section>

        {/* Features Section */}
        <section className="mt-24 grid w-full max-w-5xl grid-cols-1 gap-10 md:grid-cols-3">
          <div className="bg-card flex flex-col items-center rounded-xl border p-6 shadow-md">
            <span className="mb-4 text-4xl">🗺️</span>
            <h2 className="mb-2 text-xl font-semibold">Interactive Maps</h2>
            <p className="text-muted-foreground">
              Upload your geodata and instantly see it on beautiful, interactive
              maps. Pan, zoom, and explore your data in space and time.
            </p>
          </div>
          <div className="bg-card flex flex-col items-center rounded-xl border p-6 shadow-md">
            <span className="mb-4 text-4xl">⏳</span>
            <h2 className="mb-2 text-xl font-semibold">Temporal Analysis</h2>
            <p className="text-muted-foreground">
              Animate your data over time, filter by date ranges, and uncover
              trends and movements in your spatial datasets.
            </p>
          </div>
          <div className="bg-card flex flex-col items-center rounded-xl border p-6 shadow-md">
            <span className="mb-4 text-4xl">🔍</span>
            <h2 className="mb-2 text-xl font-semibold">Powerful Insights</h2>
            <p className="text-muted-foreground">
              Use built-in analytics to cluster, summarize, and extract meaning
              from your geodata. Share your findings with interactive
              dashboards.
            </p>
          </div>
        </section>

        {/* Call to Action */}
        <section className="mt-24 flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold">
            Ready to unlock the power of your geodata?
          </h2>
          <Button size="lg">Try TimeTiles Free</Button>
        </section>
      </main>
    </>
  );
}
