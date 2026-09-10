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
  ContentState,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@timetiles/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { DataPackageListItem } from "@/lib/data-packages/types";
import {
  useActivateDataPackageMutation,
  useDataPackagesQuery,
  useDeactivateDataPackageMutation,
} from "@/lib/hooks/use-data-packages-query";

/**
 * The action available for a package.
 *
 * Activation is instance-wide (dataPackageSlug is uniquely indexed), so a package activated
 * by someone else is neither activatable nor deactivatable by this user — offering either
 * button produced a 409 or a 403. Show the state instead.
 */
const renderPackageAction = ({
  pkg,
  isPending,
  t,
  onDeactivate,
  onActivate,
}: {
  pkg: DataPackageListItem;
  isPending: boolean;
  t: ReturnType<typeof useTranslations<"DataPackages">>;
  onDeactivate: () => void;
  onActivate: () => void;
}) => {
  if (pkg.activated && pkg.activation?.ownedByCaller !== true) {
    return <span className="text-muted-foreground text-sm">{t("activatedByAnotherUser")}</span>;
  }

  if (pkg.activated) {
    return (
      <Button variant="outline" size="sm" onClick={onDeactivate} disabled={isPending}>
        {t("deactivate")}
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={onActivate} disabled={isPending}>
      {t("activate")}
    </Button>
  );
};

const formatNumber = (n: number): string => {
  if (n >= 1000) return `~${Math.round(n / 1000)}k`;
  return String(n);
};

const PackageCard = ({ pkg }: { pkg: DataPackageListItem }) => {
  const t = useTranslations("DataPackages");
  const tCommon = useTranslations("Common");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const activateMutation = useActivateDataPackageMutation();
  const deactivateMutation = useDeactivateDataPackageMutation();

  const isPending = activateMutation.isPending || deactivateMutation.isPending;

  const handleActivate = () => {
    activateMutation.mutate({ slug: pkg.slug, parameters }, { onSuccess: () => setConfirmOpen(false) });
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
                {formatNumber(pkg.estimatedRecords)} {t("records", { count: pkg.estimatedRecords })}
              </span>
            )}
            {pkg.license && <span>{pkg.license}</span>}
            {pkg.category && <span>{pkg.category}</span>}
          </div>
        </CardContent>

        <CardFooter>
          {renderPackageAction({
            pkg,
            isPending,
            t,
            onDeactivate: handleDeactivate,
            onActivate: () => setConfirmOpen(true),
          })}
        </CardFooter>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmActivateTitle")}</DialogTitle>
            <DialogDescription>{t("confirmActivateDescription")}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!isPending) handleActivate();
            }}
            className="space-y-4"
          >
            {pkg.parameters?.map((parameter) => (
              <div key={parameter.name} className="space-y-2">
                <Label htmlFor={`${pkg.slug}-${parameter.name}`}>{parameter.label}</Label>
                <Input
                  id={`${pkg.slug}-${parameter.name}`}
                  value={Object.hasOwn(parameters, parameter.name) ? parameters[parameter.name] : ""}
                  onChange={(event) =>
                    setParameters((current) => ({ ...current, [parameter.name]: event.target.value }))
                  }
                  placeholder={parameter.example}
                  required={parameter.required}
                  disabled={isPending}
                />
              </div>
            ))}
            {activateMutation.error && (
              <p role="alert" className="text-destructive text-sm">
                {activateMutation.error.message}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {t("activate")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
