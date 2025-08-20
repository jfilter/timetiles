# @timetiles/assets

Shared assets for the TimeTiles monorepo.

## Structure

```
logos/
  ├── animated/                     # Animated logo variations (logo only)
  │   ├── 01-base-static.svg        # Base animation with subtle effects
  │   ├── 02-rotating.svg           # Rotating tiles animation
  │   ├── 03-floating.svg           # Floating tiles animation
  │   ├── 04-breathing.svg          # Breathing effect animation
  │   ├── 05-wave-cascade.svg       # Wave cascade animation
  │   ├── 06-random-drift.svg       # Random drift animation
  │   ├── 07-orbit.svg              # Orbital movement animation
  │   ├── 08-spiral.svg             # Spiral animation
  │   ├── 09-pendulum.svg           # Pendulum swing animation
  │   └── 10-magnetic-pull.svg      # Magnetic pull animation
  │
  ├── animated-with-text/           # Animated logos with TimeTiles text
  │   ├── *-horizontal.svg          # Horizontal layout (logo + text)
  │   └── *-vertical.svg            # Vertical layout (logo + text)
  │
  └── static/                       # Static logos and exports
      ├── logo-static.svg               # Main static logo (no animations)
      ├── logo-with-text-horizontal.svg # Logo + text horizontal layout
      ├── logo-with-text-vertical.svg   # Logo + text vertical layout
      │
      ├── logo-*.png                    # PNG exports (256, 512, 1024, 2048, 4096)
      ├── logo-*.jpg                    # JPG exports with white background
      ├── logo-horizontal-*.png         # Horizontal layout PNGs
      ├── logo-horizontal-*.jpg         # Horizontal layout JPGs
      ├── logo-vertical-*.png           # Vertical layout PNGs
      └── logo-vertical-*.jpg           # Vertical layout JPGs
```

## Usage

In Next.js apps, copy logos to public folder during build or use them directly:

```tsx
import logo from '@timetiles/assets/logos/logo.svg'
```

For static serving, configure your build process to copy the assets.