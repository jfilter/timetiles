/**
 * Unit tests for database operation utilities.
 *
 * @module
 * @category Tests
 */

import { vi } from "vitest";

// ─── Hoisted state (available inside vi.mock factories) ──────────────

type MockClient = { connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };

const pgState = vi.hoisted(() => {
  return {
    allClients: [] as Array<{
      connect: ReturnType<typeof vi.fn>;
      query: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    }>,
    clientFactory: null as
      | (() => { connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> })
      | null,
    newMockClient: () => ({
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

// ─── vi.mock ─────────────────────────────────────────────────────────

vi.mock("pg", () => {
  class MockPgClient {
    connect: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    constructor() {
      const c = pgState.clientFactory ? pgState.clientFactory() : pgState.newMockClient();
      this.connect = c.connect;
      this.query = c.query;
      this.end = c.end;
      pgState.allClients.push(this);
    }
  }
  return { Client: MockPgClient };
});

vi.mock("@/lib/config/env", () => ({
  getEnv: vi.fn(() => ({ DATABASE_URL: "postgresql://localhost/testdb" })),
  resetEnv: vi.fn(),
}));

// ─── Source imports ──────────────────────────────────────────────────

import { beforeEach, describe, expect, it } from "vitest";

import {
  cloneDatabase,
  createDatabase,
  databaseExists,
  dropDatabase,
  executeDatabaseQuery,
  listDatabasesByPrefix,
  terminateConnections,
  truncateTables,
} from "@/lib/database/operations";

// ─── Helpers ─────────────────────────────────────────────────────────

const { allClients } = pgState;

const setClientFactory = (fn: () => MockClient) => {
  pgState.clientFactory = fn;
};

const failingClientAt = (failIdx: number, message: string): (() => MockClient) => {
  let i = 0;
  return () => {
    const c = pgState.newMockClient();
    if (i === failIdx) {
      c.query.mockRejectedValue(new Error(message));
    }
    i++;
    return c;
  };
};

// ─── Tests ───────────────────────────────────────────────────────────

describe.sequential("database operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgState.allClients.length = 0;
    pgState.clientFactory = null;
  });

  // ─── executeDatabaseQuery ─────────────────────────────────────────

  describe("executeDatabaseQuery", () => {
    describe("direct client execution", () => {
      it("connects, queries, and disconnects the client", async () => {
        const result = await executeDatabaseQuery("testdb", "SELECT 1");

        expect(allClients).toHaveLength(1);
        const client = allClients[0]!;
        expect(client.connect).toHaveBeenCalledOnce();
        expect(client.query).toHaveBeenCalledWith("SELECT 1");
        expect(client.end).toHaveBeenCalledOnce();
        expect(result).toBe("");
      });

      it("returns empty string when query returns no rows", async () => {
        const result = await executeDatabaseQuery("testdb", "SELECT 1 WHERE false");
        expect(result).toBe("");
      });

      it("returns single column values joined by newlines", async () => {
        setClientFactory(() => {
          const c = pgState.newMockClient();
          c.query.mockResolvedValue({ rows: [{ datname: "db_one" }, { datname: "db_two" }, { datname: "db_three" }] });
          return c;
        });

        const result = await executeDatabaseQuery("postgres", "SELECT datname FROM pg_database");
        expect(result).toBe("db_one\ndb_two\ndb_three");
      });

      it("returns JSON for multi-column results", async () => {
        const rows = [
          { datname: "db_one", datistemplate: false },
          { datname: "db_two", datistemplate: true },
        ];
        setClientFactory(() => {
          const c = pgState.newMockClient();
          c.query.mockResolvedValue({ rows });
          return c;
        });

        const result = await executeDatabaseQuery("postgres", "SELECT datname, datistemplate FROM pg_database");
        expect(JSON.parse(result)).toEqual(rows);
      });

      it("always calls client.end even when query throws", async () => {
        setClientFactory(() => {
          const c = pgState.newMockClient();
          c.query.mockRejectedValue(new Error("query failed"));
          return c;
        });

        await expect(executeDatabaseQuery("testdb", "BAD SQL")).rejects.toThrow("query failed");
        expect(allClients[0]!.end).toHaveBeenCalledOnce();
      });

      it("handles rows with null first row", async () => {
        setClientFactory(() => {
          const c = pgState.newMockClient();
          c.query.mockResolvedValue({ rows: [null] });
          return c;
        });

        const result = await executeDatabaseQuery("testdb", "SELECT 1");
        expect(JSON.parse(result)).toEqual([null]);
      });
    });
  });

  // ─── terminateConnections ─────────────────────────────────────────

  describe("terminateConnections", () => {
    it("connects to postgres and terminates connections for target db", async () => {
      await terminateConnections("target_db");

      expect(allClients).toHaveLength(1);
      const client = allClients[0]!;
      expect(client.connect).toHaveBeenCalledOnce();
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining("pg_terminate_backend"), ["target_db"]);
      expect(client.end).toHaveBeenCalledOnce();
    });

    it("always disconnects even if terminate query fails", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query.mockRejectedValue(new Error("terminate failed"));
        return c;
      });

      await expect(terminateConnections("target_db")).rejects.toThrow("terminate failed");
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
    });
  });

  // ─── dropDatabase ─────────────────────────────────────────────────

  describe("dropDatabase", () => {
    it("terminates connections then drops the database", async () => {
      await dropDatabase("old_db");

      // Client 0: terminateConnections, Client 1: drop
      expect(allClients).toHaveLength(2);
      const dropClient = allClients[1]!;
      expect(dropClient.query).toHaveBeenCalledWith('DROP DATABASE "old_db"');
      expect(dropClient.end).toHaveBeenCalledOnce();
    });

    it("uses IF EXISTS when option is set", async () => {
      await dropDatabase("old_db", { ifExists: true });

      const dropClient = allClients[1]!;
      expect(dropClient.query).toHaveBeenCalledWith('DROP DATABASE IF EXISTS "old_db"');
    });

    it("does not terminate connections during opportunistic cleanup", async () => {
      await dropDatabase("old_db", { ifExists: true, terminateConnections: false });

      expect(allClients).toHaveLength(1);
      expect(allClients[0]!.query).toHaveBeenCalledExactlyOnceWith('DROP DATABASE IF EXISTS "old_db"');
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
    });

    it("propagates a busy database error without retrying or terminating connections", async () => {
      setClientFactory(failingClientAt(0, "database is being accessed by other users"));

      await expect(dropDatabase("old_db", { terminateConnections: false })).rejects.toThrow(
        "database is being accessed by other users"
      );
      expect(allClients).toHaveLength(1);
      expect(allClients[0]!.query).toHaveBeenCalledExactlyOnceWith('DROP DATABASE "old_db"');
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
    });

    it("always disconnects both clients even when drop fails", async () => {
      setClientFactory(failingClientAt(1, "drop failed"));

      await expect(dropDatabase("old_db")).rejects.toThrow("drop failed");
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
      expect(allClients[1]!.end).toHaveBeenCalledOnce();
    });
  });

  // ─── createDatabase ───────────────────────────────────────────────

  describe("createDatabase", () => {
    it("creates a database with the given name (default options)", async () => {
      await createDatabase("new_db");

      // Default options skip the existence probe — a single client issues a plain
      // CREATE DATABASE (PostgreSQL has no native CREATE DATABASE IF NOT EXISTS).
      expect(allClients).toHaveLength(1);
      const client = allClients[0]!;
      expect(client.connect).toHaveBeenCalledOnce();
      expect(client.query).toHaveBeenCalledWith('CREATE DATABASE "new_db"');
      expect(client.end).toHaveBeenCalledOnce();
    });

    it("probes existence then creates when ifNotExists is true and the db is absent", async () => {
      await createDatabase("new_db", { ifNotExists: true });

      // databaseExists() probes pg_database first on its own client...
      expect(allClients[0]!.query).toHaveBeenCalledWith("SELECT 1 FROM pg_database WHERE datname = $1", ["new_db"]);
      // ...and since it does not exist, a second client issues the plain CREATE.
      expect(allClients[1]!.query).toHaveBeenCalledWith('CREATE DATABASE "new_db"');
    });

    it("skips creation when ifNotExists is true and the database already exists", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
        return c;
      });

      await createDatabase("new_db", { ifNotExists: true });

      // Only the existence-check client is created; no CREATE DATABASE is issued.
      expect(allClients).toHaveLength(1);
      expect(allClients[0]!.query).toHaveBeenCalledWith("SELECT 1 FROM pg_database WHERE datname = $1", ["new_db"]);
      expect(allClients[0]!.query).not.toHaveBeenCalledWith('CREATE DATABASE "new_db"');
    });

    it("always disconnects even when create fails", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query.mockRejectedValue(new Error("already exists"));
        return c;
      });

      await expect(createDatabase("new_db")).rejects.toThrow("already exists");
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
    });
  });

  // ─── databaseExists ───────────────────────────────────────────────

  describe("databaseExists", () => {
    it("returns true when the database exists", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
        return c;
      });

      const result = await databaseExists("my_db");

      expect(result).toBe(true);
      expect(allClients[0]!.query).toHaveBeenCalledWith("SELECT 1 FROM pg_database WHERE datname = $1", ["my_db"]);
    });

    it("returns false when the database does not exist", async () => {
      const result = await databaseExists("nonexistent_db");
      expect(result).toBe(false);
    });

    it("always disconnects even when query fails", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query.mockRejectedValue(new Error("connection error"));
        return c;
      });

      await expect(databaseExists("my_db")).rejects.toThrow("connection error");
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
    });
  });

  // ─── listDatabasesByPrefix ────────────────────────────────────────

  describe("listDatabasesByPrefix", () => {
    it("returns matching databases ordered by name", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query.mockResolvedValue({
          rows: [{ datname: "timetiles_test_e2e_100" }, { datname: "timetiles_test_e2e_200" }],
        });
        return c;
      });

      const result = await listDatabasesByPrefix("timetiles_test_e2e_");

      expect(result).toEqual(["timetiles_test_e2e_100", "timetiles_test_e2e_200"]);
      expect(allClients[0]!.query).toHaveBeenCalledWith(expect.stringContaining("starts_with(datname, $1)"), [
        "timetiles_test_e2e_",
      ]);
    });

    it("always disconnects even when listing fails", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query.mockRejectedValue(new Error("list failed"));
        return c;
      });

      await expect(listDatabasesByPrefix("timetiles_test_e2e_")).rejects.toThrow("list failed");
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
    });
  });

  // ─── cloneDatabase ────────────────────────────────────────────────

  describe("cloneDatabase", () => {
    it("terminates template connections then clones the database", async () => {
      await cloneDatabase("template_db", "clone_db");

      expect(allClients).toHaveLength(2);
      const cloneClient = allClients[1]!;
      expect(cloneClient.query).toHaveBeenCalledWith('CREATE DATABASE "clone_db" WITH TEMPLATE "template_db"');
    });

    it("terminates connections to the template before cloning", async () => {
      await cloneDatabase("template_db", "clone_db");

      const terminateClient = allClients[0]!;
      expect(terminateClient.query).toHaveBeenCalledWith(expect.stringContaining("pg_terminate_backend"), [
        "template_db",
      ]);
    });

    it("always disconnects both clients even when clone fails", async () => {
      setClientFactory(failingClientAt(1, "template busy"));

      await expect(cloneDatabase("template_db", "clone_db")).rejects.toThrow("template busy");
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
      expect(allClients[1]!.end).toHaveBeenCalledOnce();
    });
  });

  // ─── truncateTables ───────────────────────────────────────────────

  describe("truncateTables", () => {
    it("truncates all tables in the default schema excluding migrations", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query
          .mockResolvedValueOnce({
            rows: [{ table_name: "events" }, { table_name: "users" }, { table_name: "datasets" }],
          })
          .mockResolvedValueOnce(undefined) // SET lock_timeout
          .mockResolvedValueOnce(undefined); // TRUNCATE
        return c;
      });

      const count = await truncateTables("postgresql://user:pass@localhost:5432/testdb");

      const client = allClients[0]!;
      expect(client.connect).toHaveBeenCalledOnce();

      const listCall = client.query.mock.calls[0]!;
      expect(listCall[0]).toContain("information_schema.tables");
      expect(listCall[0]).toContain("table_schema = $1");
      expect(listCall[0]).toContain("table_name NOT LIKE $2");
      expect(listCall[1]).toEqual(["payload", "payload_migrations%"]);

      // Session-level SET: outside a transaction block SET LOCAL is a no-op,
      // so the fail-fast lock timeout never actually applied.
      expect(client.query).toHaveBeenCalledWith("SET lock_timeout = '10s'");

      const truncateCall = client.query.mock.calls[2]!;
      expect(truncateCall[0]).toContain("TRUNCATE TABLE");
      expect(truncateCall[0]).toContain('payload."events"');
      expect(truncateCall[0]).toContain('payload."users"');
      expect(truncateCall[0]).toContain('payload."datasets"');
      expect(truncateCall[0]).toContain("RESTART IDENTITY CASCADE");

      expect(count).toBe(3);
      expect(client.end).toHaveBeenCalledOnce();
    });

    it("returns 0 and skips truncate when no tables found", async () => {
      const count = await truncateTables("postgresql://user:pass@localhost:5432/testdb");

      expect(count).toBe(0);
      const client = allClients[0]!;
      expect(client.query).toHaveBeenCalledTimes(1);
      expect(client.end).toHaveBeenCalledOnce();
    });

    it("uses custom schema when provided", async () => {
      await truncateTables("postgresql://user:pass@localhost:5432/testdb", { schema: "public" });

      const listCall = allClients[0]!.query.mock.calls[0]!;
      expect(listCall[1][0]).toBe("public");
    });

    it("uses custom exclude patterns", async () => {
      await truncateTables("postgresql://user:pass@localhost:5432/testdb", {
        excludePatterns: ["payload_migrations%", "payload_preferences%"],
      });

      const listCall = allClients[0]!.query.mock.calls[0]!;
      expect(listCall[0]).toContain("table_name NOT LIKE $2");
      expect(listCall[0]).toContain("table_name NOT LIKE $3");
      expect(listCall[1]).toEqual(["payload", "payload_migrations%", "payload_preferences%"]);
    });

    it("prefixes table names with schema in truncate statement", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query
          .mockResolvedValueOnce({ rows: [{ table_name: "events" }] })
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined);
        return c;
      });

      await truncateTables("postgresql://user:pass@localhost:5432/testdb", { schema: "custom" });

      const truncateCall = allClients[0]!.query.mock.calls[2]!;
      expect(truncateCall[0]).toContain('custom."events"');
    });

    it("always disconnects even when truncate fails", async () => {
      setClientFactory(() => {
        const c = pgState.newMockClient();
        c.query
          .mockResolvedValueOnce({ rows: [{ table_name: "events" }] })
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error("lock timeout"));
        return c;
      });

      await expect(truncateTables("postgresql://user:pass@localhost:5432/testdb")).rejects.toThrow("lock timeout");
      expect(allClients[0]!.end).toHaveBeenCalledOnce();
    });
  });
});
