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
  /**
   * Build a where clause for checking if an item exists in a collection.
   * Uses collection-specific logic to determine the best uniqueness check.
   */
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
      case "pages":
        return this.buildSlugOrNameWhereClause(item);
      default:
        return this.buildSlugOrNameWhereClause(item);
    }
  }

  /**
   * Build where clause for users collection - checks by email.
   */
  private buildUsersWhereClause(item: Record<string, unknown>): Where {
    const where: Where = {};
    if (item.email != null) {
      where.email = {
        equals: item.email,
      };
    }
    return where;
  }

  /**
   * Build where clause using slug if available, falling back to name.
   * Used for most collections (pages, etc.).
   */
  private buildSlugOrNameWhereClause(item: Record<string, unknown>): Where {
    const where: Where = {};
    if (item.slug != null) {
      where.slug = {
        equals: item.slug,
      };
    } else if (item.name != null) {
      where.name = {
        equals: item.name,
      };
    }
    return where;
  }

  /**
   * Build where clause for catalogs collection - checks by slug only.
   */
  private buildCatalogsWhereClause(item: Record<string, unknown>): Where {
    return this.buildSlugOnlyWhereClause(item);
  }

  /**
   * Build where clause for datasets collection - checks by slug only.
   */
  private buildDatasetsWhereClause(item: Record<string, unknown>): Where {
    return this.buildSlugOnlyWhereClause(item);
  }

  /**
   * Helper to build where clause using only slug.
   */
  private buildSlugOnlyWhereClause(item: Record<string, unknown>): Where {
    return {
      slug: {
        equals: item.slug,
      },
    };
  }

  /**
   * Build where clause for events collection - checks by title AND date.
   * Events are considered duplicates only if both title and date match.
   */
  private buildEventsWhereClause(item: Record<string, unknown>): Where {
    const where: Where = {};

    if (item.title != null && item.title !== "" && item.date != null && item.date !== "") {
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

  /**
   * Extract a human-readable display name from an item for logging.
   * Tries title, name, email, slug in order.
   */
  getDisplayName(item: Record<string, unknown>): string {
    return (
      (item.title as string) || (item.name as string) || (item.email as string) || (item.slug as string) || "Unknown"
    );
  }
}
