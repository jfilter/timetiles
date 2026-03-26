/**
 * Field box component for flexible attribute display.
 *
 * Supports plain text values and tag arrays (rendered as chips).
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";

export interface FieldBoxProps {
  label: string;
  value?: string;
  tags?: string[];
  mono?: boolean;
  capitalize?: boolean;
  status?: "success" | "failed" | "pending";
}

/** Calculate flex-grow based on value length for responsive sizing */
const getFlexGrow = (len: number): string => {
  if (len <= 10) return "flex-[1_1_140px]"; // Short: coordinates, status
  if (len <= 25) return "flex-[2_1_180px]"; // Medium: dates, providers
  return "flex-[3_1_240px]"; // Long: addresses, descriptions
};

/** A labeled value box with responsive width, optional monospace, status styling, or tag chips */
export const FieldBox = ({ label, value, tags, mono, capitalize, status }: FieldBoxProps) => {
  const displayLength = tags ? tags.join(", ").length : (value?.length ?? 0);

  return (
    <div className={cn("bg-muted/40 dark:bg-muted/20 rounded-sm px-3 py-2", getFlexGrow(displayLength))}>
      <p className="text-muted-foreground mb-0.5 text-xs">{label}</p>
      {tags ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="bg-muted dark:bg-muted/60 inline-block rounded-sm px-1.5 py-0.5 text-xs">
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p
          className={cn(
            "text-sm",
            mono && "font-mono",
            capitalize && "capitalize",
            status === "success" && "text-accent",
            status === "failed" && "text-destructive"
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
};
