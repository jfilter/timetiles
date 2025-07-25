import type { Where } from "payload";

export class QueryBuilders {
  buildWhereClause(collection: string, item: Record<string, unknown>): Where {
    switch (collection) {
      case "users":
        return this.buildUsersWhereClause(item);
      case "catalogs":
        return this.buildCatalogsWhereClause(item);
      case "datasets":
        return this.buildDatasetsWhereClause(item);
      case "events":
        return this.buildEventsWhereClause(item);
      case "imports":
        return this.buildImportsWhereClause(item);
      case "pages":
        return this.buildSlugOrNameWhereClause(item);
      default:
        return this.buildSlugOrNameWhereClause(item);
    }
  }

  private buildUsersWhereClause(item: Record<string, unknown>): Where {
    const where: Where = {};
    if (item.email != null && item.email != undefined) {
      where.email = {
        equals: item.email,
      };
    }
    return where;
  }

  private buildSlugOrNameWhereClause(item: Record<string, unknown>): Where {
    const where: Where = {};
    if (item.slug != null && item.slug != undefined) {
      where.slug = {
        equals: item.slug,
      };
    } else if (item.name != null && item.name != undefined) {
      where.name = {
        equals: item.name,
      };
    }
    return where;
  }

  private buildSlugWhereClause(item: Record<string, unknown>): Where {
    return {
      slug: {
        equals: item.slug,
      },
    };
  }

  private buildCatalogsWhereClause(item: Record<string, unknown>): Where {
    return this.buildSlugWhereClause(item);
  }

  private buildDatasetsWhereClause(item: Record<string, unknown>): Where {
    return this.buildSlugWhereClause(item);
  }

  private buildEventsWhereClause(item: Record<string, unknown>): Where {
    const where: Where = {};

    if (
      item.title != null &&
      item.title != undefined &&
      item.title != "" &&
      item.date != null &&
      item.date != undefined &&
      item.date != ""
    ) {
      where.and = [
        {
          title: {
            equals: item.title,
          },
        },
        {
          date: {
            equals: item.date,
          },
        },
      ];
    }

    return where;
  }

  private buildImportsWhereClause(item: Record<string, unknown>): Where {
    const where: Where = {};
    if (item.fileName != null && item.fileName != undefined && item.fileName != "") {
      where.fileName = {
        equals: item.fileName,
      };
    }
    return where;
  }

  getDisplayName(item: Record<string, unknown>): string {
    return (
      (item.title as string) || (item.name as string) || (item.email as string) || (item.slug as string) || "Unknown"
    );
  }
}
