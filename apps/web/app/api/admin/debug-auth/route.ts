/**
 * Debug endpoint for E2E tests to diagnose authentication issues.
 *
 * @module
 * @category API Routes
 */
import { sql } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import config from "@/payload.config";

/**
 * Test login via Payload local API and check if session is created.
 */
const testLoginAndCheckSession = async () => {
  try {
    const payload = await getPayload({ config });

    // Count sessions before
    const sessionsBefore = (await payload.db.drizzle.execute(
      sql`SELECT COUNT(*) as count FROM payload.users_sessions`
    )) as { rows: Array<{ count: string }> };
    const countBefore = parseInt(sessionsBefore.rows[0]?.count ?? "0", 10);

    // Try to login
    let loginResult;
    let loginError: string | null = null;
    try {
      loginResult = await payload.login({
        collection: "users",
        data: {
          email: "admin@example.com",
          // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- Debug endpoint for development only
          password: "admin123",
        },
      });
    } catch (err) {
      loginError = err instanceof Error ? err.message : "Unknown error";
    }

    // Count sessions after
    const sessionsAfter = (await payload.db.drizzle.execute(
      sql`SELECT COUNT(*) as count FROM payload.users_sessions`
    )) as { rows: Array<{ count: string }> };
    const countAfter = parseInt(sessionsAfter.rows[0]?.count ?? "0", 10);

    // Get session details if any
    const sessionDetails = (await payload.db.drizzle.execute(
      sql`SELECT * FROM payload.users_sessions ORDER BY created_at DESC LIMIT 5`
    )) as { rows: Array<{ id: string; _parent_id: number }> };

    return NextResponse.json({
      test: "login via payload.login()",
      sessionsBefore: countBefore,
      sessionsAfter: countAfter,
      sessionCreated: countAfter > countBefore,
      sessionDetails: sessionDetails.rows,
      loginResult: loginResult
        ? {
            token: loginResult.token?.substring(0, 50) + "...",
            userId: loginResult.user?.id,
            email: loginResult.user?.email,
          }
        : null,
      loginError,
      envPayloadSecret: process.env.PAYLOAD_SECRET ?? "NOT SET",
      envDatabaseUrl: (process.env.DATABASE_URL ?? "").replace(/:[^:@]+@/, ":****@"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Test login failed", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
};

export const GET = async (req: NextRequest) => {
  // Check for test login action
  const testLogin = req.nextUrl.searchParams.get("testLogin");
  if (testLogin === "true") {
    return testLoginAndCheckSession();
  }
  try {
    // Only allow in non-production environments
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not available in production" }, { status: 403 });
    }

    const payload = await getPayload({ config });

    // Get all users
    const users = await payload.find({
      collection: "users",
      limit: 10,
    });

    // Check sessions in database directly
    let sessionsCount = 0;
    let sessionsError: string | null = null;
    let sessionsData: unknown = null;
    try {
      const result = (await payload.db.drizzle.execute(sql`SELECT * FROM payload.users_sessions LIMIT 10`)) as {
        rows: Array<{ id: string; _parent_id: number }>;
      };
      sessionsCount = result.rows?.length ?? 0;
      sessionsData = result.rows;
    } catch (err) {
      sessionsCount = -1; // Error querying
      sessionsError = err instanceof Error ? err.message : "Unknown error";
    }

    // Try to authenticate from the request
    let authResult: { user: { id: number; email: string } | null; error?: string } = { user: null };
    try {
      const { user } = await payload.auth({ headers: req.headers });
      if (user) {
        authResult = { user: { id: user.id, email: user.email } };
      }
    } catch (error) {
      authResult = { user: null, error: error instanceof Error ? error.message : "Unknown error" };
    }

    // Check database URL
    const dbUrl = process.env.DATABASE_URL ?? "not set";
    const maskedDbUrl = dbUrl.replace(/:[^:@]+@/, ":****@");

    // Check PAYLOAD_SECRET (show full value for debugging - safe in non-prod)
    const secret = process.env.PAYLOAD_SECRET ?? "not set";

    return NextResponse.json({
      databaseUrl: maskedDbUrl,
      payloadSecret: secret,
      sessionsCount,
      sessionsError,
      sessionsData,
      users: users.docs.map((u) => ({
        id: u.id,
        email: u.email,
        verified: u._verified,
      })),
      auth: authResult,
      cookieHeader: req.headers.get("cookie")?.substring(0, 100) ?? "no cookie",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Debug failed", details: errorMessage }, { status: 500 });
  }
};
