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
   pnpm --filter docs dev

   # Or directly in docs directory
   cd apps/docs
   pnpm dev
   ```

3. **Open your browser** and navigate to `http://localhost:3001`

### Building for Production

```bash
# From project root
pnpm --filter docs build

# Or directly in docs directory
cd apps/docs
pnpm build
```

The static files will be generated in the `out` directory.

## Project Structure

```
apps/docs/
├── content/                  # Documentation pages (MDX)
│   ├── _meta.js             # Navigation configuration
│   ├── index.mdx            # Homepage
│   ├── admin-guide/         # Admin documentation
│   ├── developer-guide/     # Developer documentation
│   ├── overview/            # Product overview
│   ├── reference/           # Reference documentation
│   │   └── api/            # Auto-generated API docs (TypeDoc)
│   └── user-guide/         # User guides
├── scripts/                 # Build scripts
├── theme.config.tsx         # Nextra theme configuration
├── next.config.mjs          # Next.js configuration
└── package.json             # Dependencies and scripts
```

## Writing Documentation

### Creating New Pages

1. Create a new `.mdx` file in the appropriate directory under `content/`
2. Add the page to the corresponding `_meta.js` file for navigation
3. Use MDX syntax for rich content with React components

### Navigation Structure

Navigation is controlled by `_meta.js` files in each directory:

```javascript
// Example _meta.js
export default {
  "page-slug": "Display Name",
  "another-page": "Another Page",
};
```

### MDX Features

- **Markdown**: Standard markdown syntax
- **React Components**: Import and use React components
- **Code Highlighting**: Automatic syntax highlighting
- **Callouts**: Use Nextra's built-in callout components

Example:

```mdx
import { Callout } from "nextra/components";

<Callout type="info">Important information</Callout>
```

## Deployment

The documentation is automatically deployed to GitHub Pages when changes are pushed to the main branch.

### GitHub Actions Workflow

The deployment is handled by `.github/workflows/docs.yml`:

1. **Triggers**: On push to main branch or PR with docs changes
2. **Build**: Runs `pnpm --filter docs build` to generate static files
3. **Deploy**: Uploads to GitHub Pages

### Manual Deployment

To deploy manually:

```bash
# Build static files
pnpm --filter docs build

# The `out` directory contains the static files
# Upload these to your static hosting provider
```

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

1. **React Version Conflicts**: This project uses React 19.x
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
4. **Test** locally with `pnpm --filter docs dev`
5. **Submit** a pull request

## Links

- [Nextra Documentation](https://nextra.site/)
- [Next.js Documentation](https://nextjs.org/docs)
- [MDX Documentation](https://mdxjs.com/)
- [GitHub Pages](https://pages.github.com/)
