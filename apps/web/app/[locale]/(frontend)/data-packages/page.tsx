/**
 * Data packages page.
 *
 * Browse and activate curated data packages that provide pre-configured
 * data sources for one-click import.
 *
 * @module
 */
import { getTranslations } from "next-intl/server";

import { DataPackagesList } from "./_components/data-packages-list";

export const revalidate = 120;

export default async function DataPackagesPage() {
  const t = await getTranslations("DataPackages");

  return (
    <main className="container mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
      </div>
      <DataPackagesList />
    </main>
  );
}
