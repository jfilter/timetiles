import { Button } from "@workspace/ui/components/button";

export default function AboutPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 pt-32">
      {/* Hero Section */}
      <section className="flex max-w-4xl flex-col items-center gap-6 text-center">
        <h1 className="from-primary to-secondary bg-gradient-to-r bg-clip-text text-5xl font-extrabold leading-tight tracking-tight text-transparent">
          About TimeTiles
        </h1>
        <p className="text-muted-foreground text-xl">
          Empowering organizations to unlock the power of their spatial and
          temporal data
        </p>
      </section>

      {/* Mission Section */}
      <section className="mt-16 max-w-4xl text-center">
        <h2 className="mb-6 text-3xl font-bold">Our Mission</h2>
        <p className="text-muted-foreground text-lg leading-relaxed">
          TimeTiles was created to bridge the gap between complex geodata and
          actionable insights. We believe that everyone should have access to
          powerful geospatial analysis tools, regardless of their technical
          background. Our platform transforms raw location data into beautiful,
          interactive visualizations that reveal patterns, trends, and
          opportunities hidden within your data.
        </p>
      </section>

      {/* Story Section */}
      <section className="mt-16 max-w-4xl">
        <h2 className="mb-6 text-center text-3xl font-bold">Our Story</h2>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="bg-card rounded-xl border p-6">
            <h3 className="mb-4 text-xl font-semibold">The Problem</h3>
            <p className="text-muted-foreground">
              Organizations collect vast amounts of spatial and temporal data,
              but struggle to extract meaningful insights. Traditional tools are
              either too complex for non-technical users or too limited for
              serious analysis.
            </p>
          </div>
          <div className="bg-card rounded-xl border p-6">
            <h3 className="mb-4 text-xl font-semibold">The Solution</h3>
            <p className="text-muted-foreground">
              TimeTiles provides an intuitive, web-based platform that makes
              geospatial analysis accessible to everyone. Upload your data,
              visualize it instantly, and discover insights that drive better
              decision-making.
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="mt-16 max-w-5xl">
        <h2 className="mb-8 text-center text-3xl font-bold">Our Values</h2>
        <div className="grid gap-8 md:grid-cols-3">
          <div className="text-center">
            <div className="mb-4 text-4xl">🌍</div>
            <h3 className="mb-2 text-xl font-semibold">Accessibility</h3>
            <p className="text-muted-foreground">
              Making powerful geospatial tools available to everyone, regardless
              of technical expertise.
            </p>
          </div>
          <div className="text-center">
            <div className="mb-4 text-4xl">🔬</div>
            <h3 className="mb-2 text-xl font-semibold">Innovation</h3>
            <p className="text-muted-foreground">
              Continuously pushing the boundaries of what's possible with
              web-based geospatial analysis.
            </p>
          </div>
          <div className="text-center">
            <div className="mb-4 text-4xl">🤝</div>
            <h3 className="mb-2 text-xl font-semibold">Community</h3>
            <p className="text-muted-foreground">
              Building a community of users who share knowledge and insights to
              solve real-world problems.
            </p>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="mt-16 flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold">Ready to explore your data?</h2>
        <Button size="lg">Get Started Today</Button>
      </section>
    </main>
  );
}
