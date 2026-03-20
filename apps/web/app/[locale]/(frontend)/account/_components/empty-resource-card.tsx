/**
 * Shared empty state card for account resource lists.
 *
 * Displays a centered icon, heading, description, and optional CTA button
 * when a resource list (schedules, scrapers, etc.) has no items.
 *
 * @module
 * @category Components
 */
import { Button, Card, CardContent } from "@timetiles/ui";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";

interface EmptyResourceCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export const EmptyResourceCard = ({ icon, title, description, action }: EmptyResourceCardProps) => (
  <Card>
    <CardContent className="flex flex-col items-center justify-center py-12">
      {icon}
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 text-center text-sm">{description}</p>
      {action && (
        <Button asChild className="mt-4">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </CardContent>
  </Card>
);
