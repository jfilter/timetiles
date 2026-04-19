/**
 * Geocoding provider rate limit test.
 *
 * Tests sustained throughput at increasing rates to find the throttling threshold.
 * Usage: npx tsx scripts/geocoding-rate-test.ts [provider] [max-rps]
 * Providers: photon-komoot, photon-versatiles, nominatim
 *
 * @module
 */

const PROVIDERS = {
  "photon-komoot": {
    name: "Photon (Komoot)",
    buildUrl: (q: string) => `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=1`,
  },
  "photon-versatiles": {
    name: "Photon (VersaTiles)",
    buildUrl: (q: string) => `https://geocode.versatiles.org/api?q=${encodeURIComponent(q)}&limit=1`,
  },
  nominatim: {
    name: "Nominatim (OSM)",
    buildUrl: (q: string) =>
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
  },
} as const;

type ProviderKey = keyof typeof PROVIDERS;

const TEST_QUERIES = [
  "Berlin, Germany",
  "Paris, France",
  "London, UK",
  "New York, USA",
  "Tokyo, Japan",
  "Sydney, Australia",
  "Cairo, Egypt",
  "São Paulo, Brazil",
  "Mumbai, India",
  "Toronto, Canada",
  "Mexico City, Mexico",
  "Bangkok, Thailand",
  "Rome, Italy",
  "Moscow, Russia",
  "Seoul, South Korea",
  "Istanbul, Turkey",
  "Lagos, Nigeria",
  "Buenos Aires, Argentina",
  "Jakarta, Indonesia",
  "Nairobi, Kenya",
  "Stockholm, Sweden",
  "Warsaw, Poland",
  "Vienna, Austria",
  "Prague, Czech Republic",
  "Athens, Greece",
  "Lisbon, Portugal",
  "Dublin, Ireland",
  "Helsinki, Finland",
  "Oslo, Norway",
  "Copenhagen, Denmark",
  "Amsterdam, Netherlands",
  "Brussels, Belgium",
  "Zurich, Switzerland",
  "Barcelona, Spain",
  "Munich, Germany",
  "Milan, Italy",
  "Kyiv, Ukraine",
  "Bucharest, Romania",
  "Budapest, Hungary",
  "Bratislava, Slovakia",
  "Bogotá, Colombia",
  "Lima, Peru",
  "Santiago, Chile",
  "Montevideo, Uruguay",
  "Casablanca, Morocco",
  "Tunis, Tunisia",
  "Accra, Ghana",
  "Addis Ababa, Ethiopia",
  "Dar es Salaam, Tanzania",
  "Cape Town, South Africa",
];

interface RequestResult {
  status: number;
  latencyMs: number;
  error?: string;
}

const fireRequest = async (url: string): Promise<RequestResult> => {
  const start = performance.now();
  try {
    const response = await fetch(url, { headers: { "User-Agent": "TimeTiles-RateTest/1.0" } });
    const latencyMs = Math.round(performance.now() - start);
    await response.text();
    return { status: response.status, latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return { status: 0, latencyMs, error: (err as Error).message };
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const summarize = (
  results: RequestResult[]
): { ok: number; throttled: number; errors: number; p50: number; p95: number; max: number } => {
  const ok = results.filter((r) => r.status === 200);
  const throttled = results.filter((r) => [429, 503, 404].includes(r.status));
  const errors = results.filter((r) => r.status !== 200 && ![429, 503, 404].includes(r.status) && r.status !== 0);
  const network = results.filter((r) => r.status === 0);
  const latencies = ok.map((r) => r.latencyMs).sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const max = latencies[latencies.length - 1] ?? 0;

  return { ok: ok.length, throttled: throttled.length + network.length, errors: errors.length, p50, p95, max };
};

const testSustained = async (provider: ProviderKey, rps: number, durationSec: number): Promise<RequestResult[]> => {
  const config = PROVIDERS[provider];
  const delayMs = 1000 / rps;
  const results: RequestResult[] = [];
  const totalRequests = Math.round(rps * durationSec);

  for (let i = 0; i < totalRequests; i++) {
    const query = TEST_QUERIES[i % TEST_QUERIES.length]!;
    results.push(await fireRequest(config.buildUrl(query)));
    if (i < totalRequests - 1) await sleep(delayMs);
  }
  return results;
};

const testBurst = async (provider: ProviderKey, count: number): Promise<RequestResult[]> => {
  const config = PROVIDERS[provider];
  const promises = Array.from({ length: count }, (_, i) => {
    const query = TEST_QUERIES[i % TEST_QUERIES.length]!;
    return fireRequest(config.buildUrl(query));
  });
  return Promise.all(promises);
};

const formatRateStatus = (throttled: number, pctOk: number, errors: number): string => {
  if (throttled > 0) return `⚠ ${throttled} throttled`;
  if (pctOk === 100) return "✓ clean";
  return `✗ ${errors} errors`;
};

const findThreshold = async (provider: ProviderKey, maxRps: number) => {
  const config = PROVIDERS[provider];
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${config.name} — finding throttle threshold (up to ${maxRps} req/s)`);
  console.log("=".repeat(60));

  const testRates = [1, 2, 5, 10, 15, 20, 30, 40, 50].filter((r) => r <= maxRps);
  const durationSec = 5;

  console.log(
    `\n  ${"Rate".padStart(6)} | ${"OK".padStart(4)} | ${"Fail".padStart(5)} | ${"p50".padStart(6)} | ${"p95".padStart(6)} | ${"max".padStart(6)} | Status`
  );
  console.log(`  ${"-".repeat(60)}`);

  for (const rps of testRates) {
    const results = await testSustained(provider, rps, durationSec);
    const s = summarize(results);
    const total = s.ok + s.throttled + s.errors;
    const pctOk = Math.round((s.ok / total) * 100);
    const status = formatRateStatus(s.throttled, pctOk, s.errors);

    console.log(
      `  ${(rps + "/s").padStart(6)} | ${String(s.ok).padStart(4)} | ${String(s.throttled + s.errors).padStart(5)} | ${(s.p50 + "ms").padStart(6)} | ${(s.p95 + "ms").padStart(6)} | ${(s.max + "ms").padStart(6)} | ${status}`
    );

    // If >20% failures, no point testing higher rates
    if (pctOk < 80) {
      console.log(`\n  Stopping: ${100 - pctOk}% failure rate at ${rps} req/s`);
      break;
    }

    await sleep(3000); // cooldown
  }

  // Burst tests
  console.log(`\n  Burst tests (concurrent requests):`);
  for (const size of [10, 20, 30, 50]) {
    if (size > maxRps * 2) break;
    const results = await testBurst(provider, size);
    const s = summarize(results);
    const status = s.throttled > 0 ? `⚠ ${s.throttled} throttled` : "✓ clean";
    console.log(
      `  Burst ${String(size).padStart(3)} | OK: ${String(s.ok).padStart(3)} | p50: ${(s.p50 + "ms").padStart(6)} | ${status}`
    );
    await sleep(2000);
  }
};

const main = async () => {
  const providerArg = process.argv[2] as ProviderKey | "all" | undefined;
  const maxRps = parseInt(process.argv[3] ?? "50", 10);

  if (providerArg && providerArg !== "all" && !(providerArg in PROVIDERS)) {
    console.error(`Unknown provider: ${providerArg}`);
    console.error(`Available: ${Object.keys(PROVIDERS).join(", ")}, all`);
    process.exit(1);
  }

  const providers: ProviderKey[] =
    providerArg === "all" || !providerArg ? (Object.keys(PROVIDERS) as ProviderKey[]) : [providerArg];

  for (const p of providers) {
    await findThreshold(p, maxRps);
    if (providers.length > 1) await sleep(5000);
  }

  console.log("\nDone.");
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
};

void run();
