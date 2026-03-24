# @timetiles/ui

Themeable React component library built on [shadcn/ui](https://ui.shadcn.com/) patterns. Provides buttons, cards, charts, page-layout blocks, and design tokens for building cartographic-themed interfaces.

## Install

```bash
npm install @timetiles/ui
```

## Usage

Wrap your application with `UIProvider` and import components:

```tsx
import { UIProvider } from "@timetiles/ui/provider";
import { Button } from "@timetiles/ui/components/button";

export default function App() {
  return (
    <UIProvider>
      <Button variant="default">Get Started</Button>
    </UIProvider>
  );
}
```

## Customization

See [THEMING.md](docs/THEMING.md) for the full theming and customization guide.

## License

AGPL-3.0-or-later
