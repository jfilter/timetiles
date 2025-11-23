/**
 * Layout component for standard page containers.
 *
 * Provides consistent page layout with configurable maximum width,
 * padding, and responsive behavior. Used as a wrapper for page content
 * to maintain consistent spacing and alignment.
 *
 * @module
 * @category Components
 */
import React from "react";

const getMaxWidthClass = (
  maxWidth: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full",
  maxWidthClasses: Record<string, string>
): string => {
  // Safe property access to avoid object injection with enhanced validation
  if (
    typeof maxWidth === "string" &&
    !Object.hasOwn(Object.prototype, maxWidth) &&
    Object.hasOwn(maxWidthClasses, maxWidth)
  ) {
    return maxWidthClasses[maxWidth] ?? "";
  }
  return "";
};

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  titleClassName?: string;
  contentClassName?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";
  centered?: boolean;
  showTitle?: boolean;
}

export const PageLayout = ({
  children,
  title,
  titleClassName = "mb-8 text-center text-4xl font-bold",
  contentClassName = "text-left",
  maxWidth = "3xl",
  centered = true,
  showTitle = true,
}: Readonly<PageLayoutProps>) => {
  const maxWidthClasses: Record<typeof maxWidth, string> = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    full: "max-w-full",
  };

  return (
    <div className="min-h-screen pb-12 pt-20">
      <div className="container mx-auto max-w-4xl px-6">
        {centered ? (
          <div className="flex justify-center">
            <div className={`w-full ${getMaxWidthClass(maxWidth, maxWidthClasses)}`}>
              {showTitle === true && title != null && title !== "" && <h1 className={titleClassName}>{title}</h1>}
              <div className={contentClassName}>{children}</div>
            </div>
          </div>
        ) : (
          <div className={`w-full ${getMaxWidthClass(maxWidth, maxWidthClasses)}`}>
            {showTitle === true && title != null && title !== "" && <h1 className={titleClassName}>{title}</h1>}
            <div className={contentClassName}>{children}</div>
          </div>
        )}
      </div>
    </div>
  );
};
