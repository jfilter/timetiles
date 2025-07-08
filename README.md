# TimeTiles

A monorepo application built with Next.js, Payload CMS, and PostgreSQL + PostGIS for spatial data management and content administration.

## Development Setup

### Quick Start

1. **Clone and setup**:

   ```bash
   git clone <repository-url>
   cd timetiles
   make setup
   ```

2. **Start development (infrastructure + server)**:

   ```bash
   make dev
   ```

3. **Set up Payload CMS**:

   ```bash
   # After the dev server is running, in another terminal:
   cd apps/web
   pnpm payload create:user
   ```

### Alternative Commands

- **`make dev`** - Smart development start (recommended)
- **`make dev-full`** - Always restart infrastructure first
- **`make up`** - Start only infrastructure (Docker services)
- **`make help`** - View all available commands

### Services

- **Next.js App**: http://localhost:3000
- **Payload CMS Admin**: http://localhost:3000/admin
- **PostgreSQL**: localhost:5432 (PostGIS enabled)

For detailed development instructions, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## Project Structure

This is a turborepo monorepo with the following structure:

- `apps/web` - Next.js application with TypeScript
- `packages/ui` - Shared UI components with shadcn/ui
- `packages/eslint-config` - Shared ESLint configuration
- `packages/typescript-config` - Shared TypeScript configuration

## Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **CMS**: Payload CMS with PostgreSQL adapter
- **UI**: shadcn/ui, Tailwind CSS, Lucide React
- **Database**: PostgreSQL 17 with PostGIS extension
- **Package Manager**: pnpm
- **Build Tool**: Turbo

## Payload CMS Collections

The application includes the following collections:

- **Catalogs** - Dataset collections with rich text descriptions
- **Datasets** - Individual datasets with spatial schema definitions
- **Imports** - File import tracking with status and error logging
- **Events** - Spatial event data with coordinates and timestamps
- **Users** - User management with roles (admin, analyst, user)
- **Media** - File uploads with image processing

## Adding UI Components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Tailwind

Your `tailwind.config.ts` and `globals.css` are already set up to use the components from the `ui` package.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button";
```
