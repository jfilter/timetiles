/**
 * This file contains the seed data for the Pages collection.
 *
 * It defines a set of predefined pages with titles, slugs, and blocks content.
 * This data is used to populate the database with essential static pages like "Home",
 * "About", and "Contact", ensuring that the application has a baseline of content
 * available immediately after seeding, which is useful for development and testing.
 *
 * @module
 */
import type { Page } from "@/payload-types";

/** Seed data type for Pages. Allows string slugs for relationship fields (resolved at seed time). */
export type PageSeed = Omit<Page, "id" | "createdAt" | "updatedAt" | "site"> & { site: number | string };

/** German translations for pages, keyed by slug */
export const pagesSeedDe: Record<string, Partial<PageSeed>> = {
  home: {
    title: "Startseite",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Erkunden Sie Ihre Geodaten mit TimeTiles",
        subtitle:
          "Eine Open-Source-Plattform zur Visualisierung, Analyse und Interaktion mit räumlichen und zeitlichen Daten",
        description:
          "TimeTiles ermöglicht es Ihnen, Geodaten zu kartieren, zu filtern und Muster zu entdecken – so werden Rohdaten zu aussagekräftigen Erkenntnissen.",
        background: "grid",
        buttons: [
          { text: "Loslegen", link: "/explore", variant: "default" },
          { text: "Mehr erfahren", link: "/about", variant: "outline" },
        ],
      },
      {
        blockType: "features",
        sectionTitle: "Leistungsstarke Funktionen",
        sectionDescription: "Alles, was Sie für die Arbeit mit Geodaten brauchen",
        columns: "3",
        features: [
          {
            icon: "map",
            title: "Interaktive Karten",
            description:
              "Laden Sie Ihre Geodaten hoch und sehen Sie sie sofort auf interaktiven Karten. Schwenken, zoomen und erkunden Sie Ihre Daten in Raum und Zeit.",
            accent: "primary",
          },
          {
            icon: "timeline",
            title: "Zeitliche Analyse",
            description:
              "Animieren Sie Ihre Daten über die Zeit, filtern Sie nach Zeiträumen und entdecken Sie Trends und Bewegungen in Ihren räumlichen Datensätzen.",
            accent: "secondary",
          },
          {
            icon: "insights",
            title: "Aussagekräftige Einblicke",
            description:
              "Nutzen Sie integrierte Analysen zum Clustern, Zusammenfassen und Extrahieren von Bedeutung aus Ihren Geodaten. Teilen Sie Ihre Ergebnisse mit interaktiven Dashboards.",
            accent: "accent",
          },
        ],
      },
      {
        blockType: "stats",
        stats: [
          { value: "10.000+", label: "Kartierte Ereignisse", icon: "map" },
          { value: "500+", label: "Importierte Datensätze", icon: "timeline" },
          { value: "100%", label: "Open Source", icon: "github" },
        ],
      },
      {
        blockType: "newsletterCTA",
        headline: "Keine Entdeckung verpassen",
        description:
          "Treten Sie unserer Community bei. Erhalten Sie kuratierte Highlights, räumliche Einblicke und neue Datensatzveröffentlichungen direkt in Ihren Posteingang.",
        placeholder: "deine@email.adresse",
        buttonText: "Updates abonnieren",
        variant: "default",
        size: "default",
      },
      {
        blockType: "cta",
        headline: "Bereit, Ihre Daten zu erkunden?",
        description: "Beginnen Sie noch heute mit der Visualisierung und Analyse Ihrer Geodaten",
        buttonText: "Jetzt erkunden",
        buttonLink: "/explore",
      },
    ],
  },
  about: {
    title: "Über uns",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Über TimeTiles",
        subtitle: "Eine Open-Source-Plattform für raumbezogenes Ereignismanagement",
        background: "grid",
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "TimeTiles ist ein Open-Source-Projekt, das ein reales Problem löst: die Verwaltung und Visualisierung von Ereignissen mit Orts- und Zeitkomponenten. Ob Sie Veranstaltungen verfolgen, historische Daten analysieren oder eine Zeitleiste georeferenzierter Aktivitäten erstellen – TimeTiles bietet die Werkzeuge, die Sie brauchen.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Als Einzelentwickler-Projekt setzt TimeTiles auf praktische Funktionen statt Enterprise-Komplexität. Die Plattform kombiniert moderne Webtechnologien (Next.js, Payload CMS, PostGIS) mit Fokus auf Entwicklererfahrung und Erweiterbarkeit.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Das Projekt ist vollständig quelloffen und begrüßt Beiträge. Ob Fehlerbehebungen, neue Funktionen, Dokumentationsverbesserungen oder Vorschläge – Ihre Mitarbeit hilft, TimeTiles für alle besser zu machen.",
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
      {
        blockType: "features",
        sectionTitle: "Kernfunktionen",
        columns: "3",
        features: [
          {
            icon: "map",
            title: "Flexibler Import",
            description:
              "Importieren Sie Ereignisse aus CSV/Excel-Dateien oder richten Sie automatische Imports von URLs ein. Intelligente Schemaerkennung und Geokodierung machen die Datenaufnahme nahtlos.",
            accent: "primary",
          },
          {
            icon: "timeline",
            title: "Räumlich & Zeitlich",
            description:
              "Interaktive Karten mit Clustering, Zeitachsen-Visualisierung mit Histogrammen und leistungsstarke Filter zum Erkunden von Ereignissen in Raum und Zeit.",
            accent: "secondary",
          },
          {
            icon: "insights",
            title: "Moderner Technologie-Stack",
            description:
              "Erstellt mit Next.js 16, Payload CMS 3, PostGIS und MapLibre GL JS. Selbst-hostbar mit Docker, vollständig typisiert mit TypeScript.",
            accent: "accent",
          },
        ],
      },
      {
        blockType: "timeline",
        sectionTitle: "Projektgeschichte",
        items: [
          {
            date: "2024",
            title: "Erste Entwicklung",
            description:
              "Begonnen als Lösung zur Verwaltung standortbasierter Ereignisse. Aufbau des Import-Systems, der Geokodierung und der Kartenvisualisierung.",
          },
          {
            date: "2024",
            title: "PostGIS-Integration",
            description:
              "Einführung von PostGIS für effiziente räumliche Abfragen, serverseitiges Clustering und Geodatenanalyse.",
          },
          {
            date: "2024",
            title: "Zeitliche Funktionen",
            description:
              "Implementierung der Zeitachsen-Visualisierung, Histogramm-Aggregation und zeitlicher Filterung zur Erkundung von Ereignissen über die Zeit.",
          },
          {
            date: "2025",
            title: "Open-Source-Veröffentlichung",
            description:
              "Veröffentlicht unter Open-Source-Lizenz. Community-Beiträge zu Funktionen, Dokumentation und Tests willkommen.",
          },
        ],
      },
      {
        blockType: "testimonials",
        sectionTitle: "Was es besonders macht",
        variant: "grid",
        items: [
          {
            quote:
              "Eine praktische Plattform zur Verwaltung von Ereignissen mit raumbezogenen und zeitlichen Komponenten, ohne Enterprise-Komplexität.",
            author: "Designphilosophie",
            role: "Kernprinzip",
          },
          {
            quote:
              "Erstellt mit modernen Technologien und Best Practices. Vollständig typisiert, gut getestet und für Self-Hosting konzipiert.",
            author: "Technische Grundlage",
            role: "Architektur",
          },
          {
            quote:
              "Open Source und community-getrieben. Beiträge, Feedback und Ideen von Entwicklern und Nutzern gleichermaßen willkommen.",
            author: "Offene Entwicklung",
            role: "Gemeinschaft",
          },
        ],
      },
      {
        blockType: "cta",
        headline: "Möchten Sie mitwirken oder mehr erfahren?",
        description: "Besuchen Sie das GitHub-Repository für Code, Dokumentation und Beitragsrichtlinien",
        buttonText: "Auf GitHub ansehen",
        buttonLink: "https://github.com/jfilter/timetiles",
      },
    ],
  },
  terms: {
    title: "Nutzungsbedingungen",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Nutzungsbedingungen",
        subtitle: "Bitte lesen Sie diese Bedingungen sorgfältig durch, bevor Sie TimeTiles nutzen",
        background: "grid",
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "1. Nutzung des Dienstes" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "TimeTiles ist eine Open-Source-Plattform für raumbezogenes Ereignismanagement. Durch die Nutzung dieser Plattform stimmen Sie diesen Nutzungsbedingungen zu. Wir behalten uns das Recht vor, diese Bedingungen jederzeit zu ändern.",
                  },
                ],
              },
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "2. Benutzerkonten" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Sie sind für die Sicherheit Ihres Kontos und Passworts verantwortlich. Konten sind für den individuellen Gebrauch bestimmt und dürfen nicht geteilt werden.",
                  },
                ],
              },
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "3. Inhalte und Daten" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Sie behalten das Eigentum an den Daten, die Sie auf TimeTiles hochladen. Durch das Hochladen von Daten gewähren Sie uns die notwendigen Rechte zum Hosten und Anzeigen Ihrer Inhalte. Öffentlich geteilte Daten können von anderen Nutzern eingesehen werden.",
                  },
                ],
              },
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "4. Haftungsbeschränkung" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: 'TimeTiles wird "wie besehen" bereitgestellt, ohne Garantien jeglicher Art. Wir sind nicht verantwortlich für Datenverlust, Dienstunterbrechungen oder Schäden, die durch die Nutzung der Plattform entstehen.',
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
    ],
  },
  privacy: {
    title: "Datenschutzrichtlinie",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Datenschutzrichtlinie",
        subtitle: "Wie wir Ihre Daten sammeln, verwenden und schützen",
        background: "grid",
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "heading",
                version: 1,
                tag: "h2",
                children: [{ type: "text", text: "1. Welche Daten wir sammeln" }],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Wir sammeln die Informationen, die Sie bei der Registrierung angeben (E-Mail-Adresse), sowie die Daten, die Sie auf die Plattform hochladen (Ereignisdaten, Datensätze). Serverzugriffsprotokolle können IP-Adressen und Nutzungsmuster enthalten.",
                  },
                ],
              },
              {
                type: "heading",
                version: 1,
                tag: "h2",
                children: [{ type: "text", text: "2. Wie wir Ihre Daten verwenden" }],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Ihre Daten werden verwendet, um den Dienst bereitzustellen, einschließlich Geokodierung, Kartenvisualisierung und Datenimport-Verarbeitung. Wir verkaufen Ihre Daten nicht an Dritte.",
                  },
                ],
              },
              {
                type: "heading",
                version: 1,
                tag: "h2",
                children: [{ type: "text", text: "3. Datenspeicherung und -löschung" }],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Sie können jederzeit die Löschung Ihres Kontos und aller zugehörigen Daten beantragen. Nach einer 7-tägigen Frist werden Kontodaten dauerhaft gelöscht. IP-Adressen in Protokollen werden nach 30 Tagen anonymisiert.",
                  },
                ],
              },
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "4. Ihre Rechte (DSGVO)" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Gemäß der DSGVO haben Sie das Recht auf Auskunft, Berichtigung, Löschung und Datenübertragbarkeit Ihrer personenbezogenen Daten. Kontaktieren Sie uns, um diese Rechte auszuüben.",
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
    ],
  },
  contact: {
    title: "Kontakt",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Kontaktieren Sie uns",
        subtitle: "Fragen, Ideen oder Beiträge sind willkommen",
        background: "grid",
      },
      {
        blockType: "detailsGrid",
        variant: "grid-3",
        items: [
          {
            icon: "github",
            label: "GitHub Issues",
            value: "Ideal für Fehlerberichte, Feature-Anfragen und technische Fragen",
            link: "https://github.com/jfilter/timetiles/issues",
          },
          {
            icon: "github",
            label: "GitHub-Diskussionen",
            value: "Community-Chat, Ideen und allgemeine Fragen",
            link: "https://github.com/jfilter/timetiles/discussions",
          },
          { icon: "email", label: "E-Mail", value: "hello@timetiles.io", link: "mailto:hello@timetiles.io" },
        ],
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "TimeTiles ist ein Open-Source-Projekt, das von einem einzelnen Entwickler betreut wird. Für die schnellste Antwort und um anderen mit ähnlichen Fragen zu helfen, nutzen Sie bitte GitHub Issues oder Discussions.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Einen Fehler gefunden? Eine Idee für ein Feature? Möchten Sie Code oder Dokumentation beitragen? Das GitHub-Repository ist der Ort für die Zusammenarbeit. Alle Beiträge sind willkommen – ob Code, Dokumentation, Tests oder Design.",
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
      {
        blockType: "newsletterForm",
        headline: "Bleiben Sie informiert",
        placeholder: "deine@email.adresse",
        buttonText: "Abonnieren",
      },
      {
        blockType: "cta",
        headline: "Bereit einzusteigen?",
        description: "Markieren Sie das Repository mit einem Stern, forken Sie es oder eröffnen Sie Ihr erstes Issue",
        buttonText: "Auf GitHub ansehen",
        buttonLink: "https://github.com/jfilter/timetiles",
      },
    ],
  },
};

export const pagesSeed: PageSeed[] = [
  {
    title: "Home",
    slug: "home",
    site: "default", // Resolved by relationship resolver via site slug
    pageBuilder: [
      {
        blockType: "hero",
        title: "Explore Your Geodata with TimeTiles",
        subtitle: "An open source platform to visualize, analyze, and interact with spatial and temporal data",
        description:
          "TimeTiles lets you map, filter, and discover patterns in your geodata, making it easy to turn raw location data into actionable insights.",
        background: "grid",
        buttons: [
          { text: "Get Started", link: "/explore", variant: "default" },
          { text: "Learn More", link: "/about", variant: "outline" },
        ],
      },
      {
        blockType: "features",
        sectionTitle: "Powerful Features",
        sectionDescription: "Everything you need to work with geospatial data",
        columns: "3",
        features: [
          {
            icon: "map",
            title: "Interactive Maps",
            description:
              "Upload your geodata and instantly see it on beautiful, interactive maps. Pan, zoom, and explore your data in space and time.",
            accent: "primary",
          },
          {
            icon: "timeline",
            title: "Temporal Analysis",
            description:
              "Animate your data over time, filter by date ranges, and uncover trends and movements in your spatial datasets.",
            accent: "secondary",
          },
          {
            icon: "insights",
            title: "Powerful Insights",
            description:
              "Use built-in analytics to cluster, summarize, and extract meaning from your geodata. Share your findings with interactive dashboards.",
            accent: "accent",
          },
        ],
      },
      {
        blockType: "stats",
        stats: [
          { value: "10,000+", label: "Events Mapped", icon: "map" },
          { value: "500+", label: "Datasets Imported", icon: "timeline" },
          { value: "100%", label: "Open Source", icon: "github" },
        ],
      },
      {
        blockType: "newsletterCTA",
        headline: "Never Miss a Discovery",
        description:
          "Join our community of explorers. Get curated event highlights, spatial insights, and new dataset releases delivered to your inbox.",
        placeholder: "your@email.address",
        buttonText: "Subscribe to Updates",
        variant: "default",
        size: "default",
      },
      {
        blockType: "cta",
        headline: "Ready to explore your data?",
        description: "Start visualizing and analyzing your geospatial data today",
        buttonText: "Start Exploring",
        buttonLink: "/explore",
      },
    ],
  },
  {
    title: "About",
    slug: "about",
    site: "default",
    pageBuilder: [
      {
        blockType: "hero",
        title: "About TimeTiles",
        subtitle: "An open source platform for geospatial event management",
        background: "grid",
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "TimeTiles is an open source project built to solve a real problem: managing and visualizing events with both location and time components. Whether you're tracking community events, analyzing historical data, or building a timeline of geolocated activities, TimeTiles provides the tools you need.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "As a solo developer project, TimeTiles prioritizes practical features over enterprise complexity. The platform combines modern web technologies (Next.js, Payload CMS, PostGIS) with a focus on developer experience and extensibility.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "The project is completely open source and welcomes contributions. Whether you're fixing bugs, adding features, improving documentation, or suggesting new ideas, your input helps make TimeTiles better for everyone.",
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
      {
        blockType: "features",
        sectionTitle: "Core Capabilities",
        columns: "3",
        features: [
          {
            icon: "map",
            title: "Flexible Import",
            description:
              "Import events from CSV/Excel files or set up automated imports from URLs. Smart schema detection and geocoding make data ingestion seamless.",
            accent: "primary",
          },
          {
            icon: "timeline",
            title: "Spatial & Temporal",
            description:
              "Interactive maps with clustering, timeline visualization with histograms, and powerful filtering to explore events across both space and time.",
            accent: "secondary",
          },
          {
            icon: "insights",
            title: "Modern Stack",
            description:
              "Built with Next.js 16, Payload CMS 3, PostGIS, and MapLibre GL JS. Self-hostable with Docker, fully typed with TypeScript.",
            accent: "accent",
          },
        ],
      },
      {
        blockType: "timeline",
        sectionTitle: "Project Journey",
        items: [
          {
            date: "2024",
            title: "Initial Development",
            description:
              "Started as a solution for managing location-based events. Built core import system, geocoding, and map visualization.",
          },
          {
            date: "2024",
            title: "PostGIS Integration",
            description:
              "Added PostGIS for efficient spatial queries, server-side clustering, and geospatial analysis capabilities.",
          },
          {
            date: "2024",
            title: "Temporal Features",
            description:
              "Implemented timeline visualization, histogram aggregation, and temporal filtering to explore events over time.",
          },
          {
            date: "2025",
            title: "Open Source Release",
            description:
              "Released under open source license. Community contributions welcome for features, documentation, and testing.",
          },
        ],
      },
      {
        blockType: "testimonials",
        sectionTitle: "What Makes It Different",
        variant: "grid",
        items: [
          {
            quote:
              "A practical platform for managing events with geospatial and temporal components, without enterprise complexity.",
            author: "Design Philosophy",
            role: "Core Principle",
          },
          {
            quote:
              "Built with modern technologies and best practices. Fully typed, well-tested, and designed for self-hosting.",
            author: "Technical Foundation",
            role: "Architecture",
          },
          {
            quote:
              "Open source and community-driven. Contributions, feedback, and ideas welcome from developers and users alike.",
            author: "Open Development",
            role: "Community",
          },
        ],
      },
      {
        blockType: "cta",
        headline: "Want to contribute or learn more?",
        description: "Check out the GitHub repository for code, documentation, and contribution guidelines",
        buttonText: "View on GitHub",
        buttonLink: "https://github.com/jfilter/timetiles",
      },
    ],
  },
  {
    title: "Contact",
    slug: "contact",
    site: "default",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Get in Touch",
        subtitle: "Questions, ideas, or contributions welcome",
        background: "grid",
      },
      {
        blockType: "detailsGrid",
        variant: "grid-3",
        items: [
          {
            icon: "github",
            label: "GitHub Issues",
            value: "Best for bug reports, feature requests, and technical questions",
            link: "https://github.com/jfilter/timetiles/issues",
          },
          {
            icon: "github",
            label: "GitHub Discussions",
            value: "Community chat, ideas, and general questions",
            link: "https://github.com/jfilter/timetiles/discussions",
          },
          { icon: "email", label: "Email", value: "hello@timetiles.io", link: "mailto:hello@timetiles.io" },
        ],
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "TimeTiles is an open source project maintained by a solo developer. For the fastest response and to help others with similar questions, please use GitHub Issues or Discussions.",
                  },
                ],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Found a bug? Have an idea for a feature? Want to contribute code or documentation? The GitHub repository is the place to collaborate. All contributions are welcome, whether it's code, documentation, testing, or design.",
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
      {
        blockType: "newsletterForm",
        headline: "Stay Updated",
        placeholder: "your@email.address",
        buttonText: "Subscribe",
      },
      {
        blockType: "cta",
        headline: "Ready to dive in?",
        description: "Star the repository, fork it, or open your first issue",
        buttonText: "View on GitHub",
        buttonLink: "https://github.com/jfilter/timetiles",
      },
    ],
  },
  {
    title: "Terms of Service",
    slug: "terms",
    site: "default",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Terms of Service",
        subtitle: "Please read these terms carefully before using TimeTiles",
        background: "grid",
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "1. Use of Service" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "TimeTiles is an open source geospatial event management platform. By using this platform, you agree to these terms of service. We reserve the right to modify these terms at any time.",
                  },
                ],
              },
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "2. User Accounts" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "You are responsible for maintaining the security of your account and password. Accounts are intended for individual use and must not be shared.",
                  },
                ],
              },
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "3. Content and Data" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "You retain ownership of data you upload to TimeTiles. By uploading data, you grant us the necessary rights to host and display your content. Publicly shared data may be viewed by other users.",
                  },
                ],
              },
              {
                type: "heading",
                version: 1,
                tag: "h2",
                children: [{ type: "text", text: "4. Limitation of Liability" }],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: 'TimeTiles is provided "as is" without warranties of any kind. We are not responsible for data loss, service interruptions, or damages arising from use of the platform.',
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
    ],
  },
  {
    title: "Privacy Policy",
    slug: "privacy",
    site: "default",
    pageBuilder: [
      {
        blockType: "hero",
        title: "Privacy Policy",
        subtitle: "How we collect, use, and protect your data",
        background: "grid",
      },
      {
        blockType: "richText",
        content: {
          root: {
            type: "root",
            children: [
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "1. Data We Collect" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "We collect the information you provide when registering (email address) and data you upload to the platform (event data, datasets). Server access logs may include IP addresses and usage patterns.",
                  },
                ],
              },
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "2. How We Use Your Data" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Your data is used to provide the service, including geocoding, map visualization, and data import processing. We do not sell your data to third parties.",
                  },
                ],
              },
              {
                type: "heading",
                version: 1,
                tag: "h2",
                children: [{ type: "text", text: "3. Data Retention and Deletion" }],
              },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "You can request deletion of your account and all associated data at any time. After a 7-day grace period, account data is permanently deleted. IP addresses in audit logs are anonymized after 30 days.",
                  },
                ],
              },
              { type: "heading", version: 1, tag: "h2", children: [{ type: "text", text: "4. Your Rights (GDPR)" }] },
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Under the GDPR, you have the right to access, rectify, delete, and port your personal data. Contact us to exercise these rights.",
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
      },
    ],
  },
];
