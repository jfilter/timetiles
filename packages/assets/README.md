# @timetiles/assets

Shared TimeTiles logos and visual assets.

The SVG files below `logos/latest/` are the canonical, committed sources. PNG
exports and favicons are generated on demand and ignored by Git:

```bash
pnpm --filter @timetiles/assets generate:logos
```

The command creates `png/` next to each SVG variant. It exports square logos at
16–2000 px, compact and horizontal wordmarks at 256–2000 px, and multi-size
favicons for the non-transparent variants.

Use SVG assets directly in applications:

```tsx
import logo from "@timetiles/assets/logos/latest/light/no-grid/logo_square.svg";
```

To download a complete generated branding archive without a local checkout, run
the `Generate Logo Assets` workflow in GitHub Actions.
