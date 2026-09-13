/**
 * DataTable with pagination and empty-state texts from the active locale.
 *
 * @module
 * @category Components
 */
"use client";

import { DataTable, type DataTableProps } from "@timetiles/ui/components/data-table";
import { useTranslations } from "next-intl";

export const LocalizedDataTable = <TData, TValue>(props: Omit<DataTableProps<TData, TValue>, "labels">) => {
  const t = useTranslations("Common");

  return (
    <DataTable
      {...props}
      labels={{
        previous: t("previous"),
        next: t("next"),
        pageOf: (page, total) => t("pageOf", { page, total }),
        noResults: t("noResults"),
      }}
    />
  );
};
