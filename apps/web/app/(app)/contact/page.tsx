import { Button } from "@workspace/ui/components/button";

export default function ContactPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 pt-32">
      {/* Hero Section */}
      <section className="flex max-w-4xl flex-col items-center gap-6 text-center">
        <h1 className="from-primary to-secondary bg-gradient-to-r bg-clip-text text-5xl font-extrabold leading-tight tracking-tight text-transparent">
          Contact Us
        </h1>
        <p className="text-muted-foreground text-xl">
          Get in touch with our team for support, partnerships, or general
          inquiries
        </p>
      </section>

      {/* Contact Methods */}
      <section className="mt-16 grid w-full max-w-4xl gap-8 md:grid-cols-3">
        <div className="bg-card flex flex-col items-center rounded-xl border p-6 text-center">
          <div className="mb-4 text-4xl">📧</div>
          <h3 className="mb-2 text-xl font-semibold">Email</h3>
          <p className="text-muted-foreground mb-4">
            Send us an email and we'll get back to you within 24 hours.
          </p>
          <a
            href="mailto:hello@timetiles.com"
            className="text-primary hover:underline"
          >
            hello@timetiles.com
          </a>
        </div>

        <div className="bg-card flex flex-col items-center rounded-xl border p-6 text-center">
          <div className="mb-4 text-4xl">💬</div>
          <h3 className="mb-2 text-xl font-semibold">Support</h3>
          <p className="text-muted-foreground mb-4">
            Need help with your account or have technical questions?
          </p>
          <a
            href="mailto:support@timetiles.com"
            className="text-primary hover:underline"
          >
            support@timetiles.com
          </a>
        </div>

        <div className="bg-card flex flex-col items-center rounded-xl border p-6 text-center">
          <div className="mb-4 text-4xl">🤝</div>
          <h3 className="mb-2 text-xl font-semibold">Partnerships</h3>
          <p className="text-muted-foreground mb-4">
            Interested in partnering with us or enterprise solutions?
          </p>
          <a
            href="mailto:partnerships@timetiles.com"
            className="text-primary hover:underline"
          >
            partnerships@timetiles.com
          </a>
        </div>
      </section>

      {/* Contact Form */}
      <section className="mt-16 w-full max-w-2xl">
        <h2 className="mb-6 text-center text-3xl font-bold">
          Send us a message
        </h2>
        <div className="bg-card rounded-xl border p-6">
          <form className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-medium"
                >
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  className="border-input bg-background ring-offset-background focus:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  className="border-input bg-background ring-offset-background focus:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="subject"
                className="mb-2 block text-sm font-medium"
              >
                Subject
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                required
                className="border-input bg-background ring-offset-background focus:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
              />
            </div>
            <div>
              <label
                htmlFor="message"
                className="mb-2 block text-sm font-medium"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={5}
                required
                className="border-input bg-background ring-offset-background focus:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
              />
            </div>
            <Button type="submit" className="w-full">
              Send Message
            </Button>
          </form>
        </div>
      </section>

      {/* Additional Info */}
      <section className="mt-16 text-center">
        <h3 className="mb-4 text-xl font-semibold">Other ways to reach us</h3>
        <div className="text-muted-foreground flex flex-col gap-2">
          <p>Follow us on social media for updates and news</p>
          <div className="flex justify-center gap-4">
            <a href="#" className="text-primary hover:underline">
              Twitter
            </a>
            <a href="#" className="text-primary hover:underline">
              LinkedIn
            </a>
            <a href="#" className="text-primary hover:underline">
              GitHub
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
