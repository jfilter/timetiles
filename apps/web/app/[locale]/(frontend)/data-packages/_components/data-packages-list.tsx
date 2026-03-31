/**
 * Data packages list with activation controls.
 *
 * Renders a grid of cards for available data packages. Each card shows
 * metadata and provides activate/deactivate actions.
 *
 * @module
 * @category Components
 */
"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  ContentState,
} from "@timetiles/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  useActivateDataPackageMutation,
  useDataPackagesQuery,
  useDeactivateDataPackageMutation,
} from "@/lib/hooks/use-data-packages-query";
import type { DataPackageListItem } from "@/lib/types/data-packages";

const formatNumber = (n: number): string => {
  if (n >= 1000) return `~${Math.round(n / 1000)}k`;
  return String(n);
};

const PackageCard = ({ pkg }: { pkg: DataPackageListItem }) => {
  const t = useTranslations("DataPackages");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const activateMutation = useActivateDataPackageMutation();
  const deactivateMutation = useDeactivateDataPackageMutation();

  const isPending = activateMutation.isPending || deactivateMutation.isPending;

  const handleActivate = () => {
    activateMutation.mutate({ slug: pkg.slug }, { onSuccess: () => setConfirmOpen(false) });
  };

  const handleDeactivate = () => {
    deactivateMutation.mutate(pkg.slug);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-lg">{pkg.title}</CardTitle>
              {pkg.region && <CardDescription className="mt-1">{pkg.region}</CardDescription>}
            </div>
            {pkg.activated && (
              <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium">
                {t("activated")}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <p className="text-muted-foreground text-sm">{pkg.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {pkg.tags.map((tag) => (
              <span key={tag} className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs">
                {tag}
              </span>
            ))}
          </div>
          <div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
            {pkg.estimatedRecords && (
              <span>
                {formatNumber(pkg.estimatedRecords)} {t("records")}
              </span>
            )}
            {pkg.license && <span>{pkg.license}</span>}
            {pkg.category && <span>{pkg.category}</span>}
          </div>
        </CardContent>

        <CardFooter>
          {pkg.activated ? (
            <Button variant="outline" size="sm" onClick={handleDeactivate} disabled={isPending}>
              {t("deactivate")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={isPending}>
              {t("activate")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirmActivateTitle")}
        description={t("confirmActivateDescription")}
        confirmLabel={t("activate")}
        onConfirm={handleActivate}
      />
    </>
  );
};

export const DataPackagesList = () => {
  const t = useTranslations("DataPackages");
  const { data, isLoading, error } = useDataPackagesQuery();

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center">{t("loading")}</div>;
  }

  if (error) {
    return <ContentState variant="error" title={t("errorTitle")} subtitle={t("errorSubtitle")} />;
  }

  const packages = data?.packages ?? [];

  if (packages.length === 0) {
    return <ContentState variant="empty" title={t("emptyTitle")} subtitle={t("emptySubtitle")} />;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => (
        <PackageCard key={pkg.slug} pkg={pkg} />
      ))}
    </div>
  );
};
