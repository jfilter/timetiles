/**
 * Collapsible filter section component for organizing filter controls.
 *
 * Wraps filter groups in an expandable/collapsible container with
 * title, active count badge, and smooth animations.
 *
 * @module
 * @category Components
 */
"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  activeCount?: number;
  children: React.ReactNode;
}

export const FilterSection = ({
  title,
  defaultOpen = true,
  activeCount = 0,
  children,
}: Readonly<FilterSectionProps>) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-border border-b py-1">
      <CollapsibleTrigger className="hover:text-muted-foreground flex w-full items-center justify-between py-3 text-sm font-medium transition-colors">
        <span className="flex items-center gap-2">
          {title}
          {activeCount > 0 && (
            <span className="bg-primary/10 text-primary rounded-sm px-2 py-0.5 text-xs font-normal">{activeCount}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3">
        <div className="space-y-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};
