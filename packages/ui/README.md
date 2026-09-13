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

## Translations

Built-in texts such as pagination, the mobile navigation drawer, empty and error states, and confirm dialogs default to English. Pass translations once through `UIProvider`; missing entries keep their English default. Components that still accept a label prop, such as `ConfirmDialog`, `ContentState` and the charts, let that prop override the provider:

```tsx
<UIProvider labels={{ previous: "Zurück", next: "Weiter", pageOf: (page, total) => `Seite ${page} von ${total}` }}>
  {children}
</UIProvider>
```

## Customization

See [THEMING.md](docs/THEMING.md) for the full theming and customization guide.

## License

AGPL-3.0-or-later
