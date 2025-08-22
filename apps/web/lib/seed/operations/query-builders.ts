/**
 * This file contains the `QueryBuilders` class, which is responsible for constructing
 * database query conditions (`Where` clauses) for different collections.
 *
 * During the seeding process, it's often necessary to check if an item already exists
 * in the database to avoid creating duplicates. This class provides a centralized and
 * collection-aware way to build the appropriate query for this check. For example, it
 * knows to check for users by email and for most other collections by slug or name.
 *
 * @module
 */
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
      case "import-jobs":
        return this.buildImportJobsWhereClause(item);
      case "import-files":
        return this.buildImportFilesWhereClause(item);
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

  private buildImportFilesWhereClause(item: Record<string, unknown>): Where {
    return this.buildFilenameWhereClause(item);
  }

  private buildImportJobsWhereClause(item: Record<string, unknown>): Where {
    return this.buildFilenameWhereClause(item);
  }

  private buildFilenameWhereClause(item: Record<string, unknown>): Where {
    const where: Where = {};
    if (item.filename != null && item.filename != undefined && item.filename != "") {
      where.filename = {
        equals: item.filename,
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
