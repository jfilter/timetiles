# TimeTiles Documentation

This is the documentation site for TimeTiles, built with [Nextra](https://nextra.site/) and deployed to GitHub Pages.

## Development

### Prerequisites

- Node.js 24 or later
- pnpm 10.12.4 or later

### Getting Started

1. **Install dependencies** (from project root):

   ```bash
   pnpm install
   ```

2. **Start development server**:

   ```bash
   # From project root
   pnpm docs:dev

   # Or directly in docs directory
   cd apps/docs
   pnpm dev
   ```

3. **Open your browser** and navigate to `http://localhost:3001`

### Building for Production

```bash
# From project root
pnpm docs:build
pnpm docs:export

# Or directly in docs directory
cd apps/docs
pnpm build
```

The static files will be generated in the `out` directory.

## Project Structure

```
apps/docs/
├── pages/                    # Documentation pages (MDX)
│   ├── _meta.json           # Navigation configuration
│   ├── index.mdx            # Homepage
│   ├── getting-started/     # Getting started guides
│   ├── guides/              # User guides
│   ├── api/                 # API documentation
│   ├── development/         # Developer documentation
│   └── reference/           # Reference materials
├── theme.config.tsx         # Nextra theme configuration
├── next.config.mjs          # Next.js configuration
└── package.json             # Dependencies and scripts
```

## Writing Documentation

### Creating New Pages

1. Create a new `.mdx` file in the appropriate directory under `pages/`
2. Add the page to the corresponding `_meta.json` file for navigation
3. Use MDX syntax for rich content with React components

### Navigation Structure

Navigation is controlled by `_meta.json` files in each directory:

```json
{
  "page-slug": "Display Name",
  "another-page": "Another Page"
}
```

### MDX Features

- **Markdown**: Standard markdown syntax
- **React Components**: Import and use React components
- **Code Highlighting**: Automatic syntax highlighting
- **Callouts**: Use Nextra's built-in callout components

Example:

````mdx
# Page Title

Regular markdown content.

import { Callout } from "nextra/components";

<Callout type="info">This is an info callout.</Callout>

```javascript
// Code blocks with syntax highlighting
function example() {
  return "Hello, world!";
}
```
````

````

## Deployment

The documentation is automatically deployed to GitHub Pages when changes are pushed to the main branch.

### GitHub Actions Workflow

The deployment is handled by `.github/workflows/docs.yml`:

1. **Triggers**: On push to main branch or PR with docs changes
2. **Build**: Runs `pnpm docs:export` to generate static files
3. **Deploy**: Uploads to GitHub Pages

### Manual Deployment

To deploy manually:

```bash
# Build and export
pnpm docs:export

# The `out` directory contains the static files
# Upload these to your static hosting provider
````

## Configuration

### Theme Configuration

Edit `theme.config.tsx` to customize:

- Site title and logo
- Navigation links
- Footer content
- Search functionality
- Social links

### Next.js Configuration

Edit `next.config.mjs` for:

- GitHub Pages deployment settings
- Base path configuration
- Static export settings

## Troubleshooting

### Build Issues

1. **React Version Conflicts**: Ensure React 18.x is used (not 19.x)
2. **Missing Dependencies**: Run `pnpm install` from project root
3. **TypeScript Errors**: Check `tsconfig.json` extends workspace config

### Development Issues

1. **Port Conflicts**: Docs run on port 3001 by default
2. **Hot Reload**: Changes should auto-reload in development
3. **Navigation**: Check `_meta.json` files for proper structure

### Deployment Issues

1. **GitHub Pages**: Ensure repository has Pages enabled
2. **Base Path**: Check `next.config.mjs` for correct repository name
3. **Static Export**: Verify `out` directory is generated correctly

## Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Add** or update documentation
4. **Test** locally with `pnpm docs:dev`
5. **Submit** a pull request

## Links

- [Nextra Documentation](https://nextra.site/)
- [Next.js Documentation](https://nextjs.org/docs)
- [MDX Documentation](https://mdxjs.com/)
- [GitHub Pages](https://pages.github.com/)
