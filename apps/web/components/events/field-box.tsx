/**
 * Field box component for flexible attribute display.
 *
 * @module
 * @category Components
 */
import { cn } from "@timetiles/ui/lib/utils";

export interface FieldBoxProps {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
  status?: "success" | "failed" | "pending";
}

/** Calculate flex-grow based on value length for responsive sizing */
const getFlexGrow = (value: string): string => {
  const len = value.length;
  if (len <= 10) return "flex-[1_1_140px]"; // Short: coordinates, status
  if (len <= 25) return "flex-[2_1_180px]"; // Medium: dates, providers
  return "flex-[3_1_240px]"; // Long: addresses, descriptions
};

/** A labeled value box with responsive width, optional monospace and status styling */
export const FieldBox = ({ label, value, mono, capitalize, status }: FieldBoxProps) => (
  <div className={cn("bg-muted/40 dark:bg-muted/20 rounded-sm px-3 py-2", getFlexGrow(value))}>
    <p className="text-muted-foreground mb-0.5 text-xs">{label}</p>
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
  </div>
);
