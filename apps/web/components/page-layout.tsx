import React from "react";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  titleClassName?: string;
  contentClassName?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";
  centered?: boolean;
  showTitle?: boolean;
}

export function PageLayout({
  children,
  title,
  titleClassName = "mb-8 text-center text-4xl font-bold",
  contentClassName = "text-left",
  maxWidth = "3xl",
  centered = true,
  showTitle = true,
}: PageLayoutProps) {
  const maxWidthClasses = {
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
    <div className="min-h-screen pb-12 pt-32">
      <div className="container mx-auto max-w-4xl px-6">
        {centered ? (
          <div className="flex justify-center">
            <div className={`w-full ${maxWidthClasses[maxWidth]}`}>
              {showTitle && title && (
                <h1 className={titleClassName}>{title}</h1>
              )}
              <div className={contentClassName}>{children}</div>
            </div>
          </div>
        ) : (
          <div className={`w-full ${maxWidthClasses[maxWidth]}`}>
            {showTitle && title && <h1 className={titleClassName}>{title}</h1>}
            <div className={contentClassName}>{children}</div>
          </div>
        )}
      </div>
    </div>
  );
}
