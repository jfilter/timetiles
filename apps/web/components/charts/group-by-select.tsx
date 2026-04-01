/**
 * GroupBy selector for fullscreen chart mode.
 *
 * Renders an enriched Select dropdown where each option shows a label
 * and a muted description. The trigger displays only the selected label.
 *
 * @module
 * @category Components
 */
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@timetiles/ui/components/select";
import { useTranslations } from "next-intl";

import type { GroupByOption } from "./event-beeswarm";

interface GroupBySelectProps {
  value: string;
  onChange: (value: string) => void;
  options: GroupByOption[];
}

export const GroupBySelect = ({ value, onChange, options }: Readonly<GroupBySelectProps>) => {
  const t = useTranslations("Explore");
  const selectedLabel = options.find((o) => o.value === value)?.label ?? t("groupByNone");

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={t("groupBy")} className="border-primary/20 bg-background w-auto min-w-[160px]">
        <span className="truncate">{selectedLabel}</span>
      </SelectTrigger>
      <SelectContent className="max-w-[400px]">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="py-2">
            <div className="flex flex-col gap-0.5">
              <span>{opt.label}</span>
              {opt.description && <span className="text-muted-foreground text-xs font-normal">{opt.description}</span>}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
