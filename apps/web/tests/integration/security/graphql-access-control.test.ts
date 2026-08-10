// @vitest-environment node
/**
 * Security tests for the Payload GraphQL endpoint.
 *
 * GraphQL exposes the whole Payload config over a second transport. A guard
 * that lives only in a REST route (or only in a `lib/api` handler) therefore
 * does not protect the same data here — a class of bug this repo already
 * shipped once.
 *
 * Two things are locked in. First, the shipped config disables GraphQL, so the
 * route answers 404 — that is the current security posture and a silent
 * re-enable must break a test. Second, the access rules are exercised against
 * the real route with GraphQL temporarily enabled, so re-enabling it on purpose
 * does not open a read path around collection and field access.
 *
 * @module
 */

import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as graphqlPOST } from "@/app/(payload)/api/graphql/route";
import configPromise from "@/payload.config";
import type { Catalog, Dataset, Event, ScheduledIngest, User } from "@/payload-types";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import {
  createIntegrationTestEnvironment,
  withCatalog,
  withScheduledIngest,
  withUsers,
} from "@/tests/setup/integration/environment";

interface GraphQLResponse {
  data?: Record<string, any> | null;
  errors?: { message: string }[];
}

describe.sequential("GraphQL endpoint access control", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let ownerUser: User;
  let otherUser: User;
  let editorUser: User;
  let adminUser: User;

  let privateCatalog: Catalog;
  let privateDataset: Dataset;
  let privateEvent: Event;
  let ownerSchedule: ScheduledIngest;

  const SECRET_API_KEY = TEST_CREDENTIALS.apiKey.secretKey;
  const SECRET_HEADER_VALUE = TEST_CREDENTIALS.bearer.superSecretToken;

  /** The Payload instance the route handler itself resolves (its config decides the 404). */
  let routePayload: any;
  let graphqlDisabledByDefault: boolean | undefined;

  const setGraphqlDisabled = (disabled: boolean): void => {
    routePayload.config.graphQL.disable = disabled;
  };

  const loginToken = async (email: string): Promise<string> => {
    const result = await payload.login({
      collection: "users",
      data: { email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    expect(result.token).toBeDefined();
    return result.token as string;
  };

  /** Drive the real GraphQL route handler, optionally authenticated. */
  const graphqlRequest = (query: string, token?: string): NextRequest => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token != null) headers.set("Authorization", `Bearer ${token}`);
    return new NextRequest("http://localhost:3000/api/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    });
  };

  const datasetByIdQuery = (id: string | number) => `query { Dataset(id: ${id}) { id name } }`;

  const gql = async (query: string, token?: string): Promise<GraphQLResponse> => {
    const response = await graphqlPOST(graphqlRequest(query, token));
    expect(response.status).toBe(200);
    return (await response.json()) as GraphQLResponse;
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    routePayload = await getPayload({ config: configPromise });
    graphqlDisabledByDefault = routePayload.config.graphQL?.disable;

    await payload.updateGlobal({
      slug: "settings",
      data: { featureFlags: { allowPrivateImports: true, enableScheduledIngests: true } },
    });

    const { users } = await withUsers(testEnv, {
      gqlOwner: { role: "user", _verified: true },
      gqlOther: { role: "user", _verified: true },
      gqlEditor: { role: "editor", _verified: true },
      gqlAdmin: { role: "admin", _verified: true },
    });
    ownerUser = users.gqlOwner;
    otherUser = users.gqlOther;
    editorUser = users.gqlEditor;
    adminUser = users.gqlAdmin;

    // eslint-disable-next-line require-atomic-updates -- Sequential test setup, no race condition
    testEnv = await withCatalog(testEnv, { name: "GraphQL Private Catalog", isPublic: false, user: ownerUser });
    privateCatalog = testEnv.catalog;

    privateDataset = await payload.create({
      collection: "datasets",
      data: { name: "GraphQL Private Dataset", catalog: privateCatalog.id, language: "eng", isPublic: false },
      user: ownerUser,
    });

    privateEvent = await payload.create({
      collection: "events",
      data: {
        dataset: privateDataset.id,
        sourceData: { title: "GRAPHQL PRIVATE EVENT" },
        transformedData: { title: "GRAPHQL PRIVATE EVENT" },
        uniqueId: `${privateDataset.id}:graphql:private-event`,
      },
      user: ownerUser,
    });

    const { scheduledIngest } = await withScheduledIngest(
      testEnv,
      privateCatalog.id,
      "https://example.com/graphql-secret.csv",
      { name: "GraphQL secret schedule", frequency: "daily", user: ownerUser }
    );
    ownerSchedule = scheduledIngest;

    await payload.update({
      collection: "scheduled-ingests",
      id: ownerSchedule.id,
      data: {
        authConfig: {
          type: "api-key",
          apiKey: SECRET_API_KEY,
          customHeaders: { "X-Secret-Header": SECRET_HEADER_VALUE },
        },
      },
      user: ownerUser,
      overrideAccess: false,
    });
  }, 90000);

  afterAll(async () => {
    if (routePayload?.config?.graphQL) setGraphqlDisabled(graphqlDisabledByDefault !== false);
    await cleanup();
  });

  describe("shipped posture", () => {
    it("disables GraphQL, so the route answers 404 for an anonymous caller", async () => {
      expect(graphqlDisabledByDefault).toBe(true);
      setGraphqlDisabled(true);

      const response = await graphqlPOST(graphqlRequest(`query { Datasets(limit: 1) { docs { id } } }`));

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    });
  });

  // The remaining blocks temporarily enable GraphQL on the route's own Payload
  // instance: if the endpoint is ever switched on deliberately, these are the
  // guarantees it has to keep. The flag is restored in afterAll.
  describe("collection access rules", () => {
    beforeAll(() => {
      setGraphqlDisabled(false);
    });

    it("hides a private dataset from an anonymous GraphQL query", async () => {
      const result = await gql(`query { Datasets(limit: 200) { docs { id name } } }`);

      const ids = (result.data?.Datasets?.docs ?? []).map((d: { id: unknown }) => String(d.id));
      expect(ids).not.toContain(String(privateDataset.id));
    });

    it("hides a private event from an anonymous GraphQL query", async () => {
      const result = await gql(`query { Events(limit: 200) { docs { id uniqueId } } }`);

      const ids = (result.data?.Events?.docs ?? []).map((d: { id: unknown }) => String(d.id));
      expect(ids).not.toContain(String(privateEvent.id));
      expect(JSON.stringify(result)).not.toContain("GRAPHQL PRIVATE EVENT");
    });

    it("returns the private dataset by ID to its owner (byID query is wired correctly)", async () => {
      const token = await loginToken(ownerUser.email);

      const result = await gql(datasetByIdQuery(privateDataset.id), token);

      expect(String(result.data?.Dataset?.id)).toBe(String(privateDataset.id));
    });

    it("denies an anonymous byID lookup of a private dataset", async () => {
      const result = await gql(datasetByIdQuery(privateDataset.id));

      expect(result.data?.Dataset ?? null).toBeNull();
    });

    it("does not expose another user's private dataset to a non-owner", async () => {
      const token = await loginToken(otherUser.email);

      const result = await gql(`query { Datasets(limit: 200) { docs { id name } } }`, token);

      const ids = (result.data?.Datasets?.docs ?? []).map((d: { id: unknown }) => String(d.id));
      expect(ids).not.toContain(String(privateDataset.id));
    });

    it("does not expose another user's scheduled ingest to a non-owner", async () => {
      const token = await loginToken(otherUser.email);

      const result = await gql(`query { ScheduledIngests(limit: 200) { docs { id name } } }`, token);

      const ids = (result.data?.ScheduledIngests?.docs ?? []).map((d: { id: unknown }) => String(d.id));
      expect(ids).not.toContain(String(ownerSchedule.id));
    });

    it("still lets the owner read their own private dataset (guard is not blanket-deny)", async () => {
      const token = await loginToken(ownerUser.email);

      const result = await gql(`query { Datasets(limit: 200) { docs { id name } } }`, token);

      const ids = (result.data?.Datasets?.docs ?? []).map((d: { id: unknown }) => String(d.id));
      expect(ids).toContain(String(privateDataset.id));
    });
  });

  describe("field-level credential access", () => {
    beforeAll(() => {
      setGraphqlDisabled(false);
    });

    const credentialQuery = (id: string | number) => `
      query {
        ScheduledIngest(id: ${id}) {
          id
          authConfig { type apiKey customHeaders }
        }
      }
    `;

    it("lets the owner read their own credentials", async () => {
      const token = await loginToken(ownerUser.email);

      const result = await gql(credentialQuery(ownerSchedule.id), token);

      expect(result.data?.ScheduledIngest?.authConfig?.apiKey).toBe(SECRET_API_KEY);
    });

    it("does not leak credentials of another user's schedule to an editor", async () => {
      const token = await loginToken(editorUser.email);

      const result = await gql(credentialQuery(ownerSchedule.id), token);

      // The editor may read the document (createOwnershipAccess grants privileged
      // read), but `authConfig.apiKey`/`customHeaders` are owner-or-admin only.
      // The editor does reach the document (privileged read), which is what makes
      // the missing credential a field-level guard rather than a hidden document.
      expect(String(result.data?.ScheduledIngest?.id)).toBe(String(ownerSchedule.id));
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(SECRET_API_KEY);
      expect(serialized).not.toContain(SECRET_HEADER_VALUE);
      expect(result.data?.ScheduledIngest?.authConfig?.apiKey ?? null).toBeNull();
    });

    it("does not leak credentials to an anonymous caller", async () => {
      const result = await gql(credentialQuery(ownerSchedule.id));

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(SECRET_API_KEY);
      expect(serialized).not.toContain(SECRET_HEADER_VALUE);
    });

    it("does not leak credentials through a list query for a non-owner", async () => {
      const token = await loginToken(otherUser.email);

      const result = await gql(
        `query { ScheduledIngests(limit: 200) { docs { id authConfig { type apiKey customHeaders } } } }`,
        token
      );

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(SECRET_API_KEY);
      expect(serialized).not.toContain(SECRET_HEADER_VALUE);
    });

    it("lets an admin read credentials (owner-or-admin rule, not owner-only)", async () => {
      const token = await loginToken(adminUser.email);

      const result = await gql(credentialQuery(ownerSchedule.id), token);

      expect(result.data?.ScheduledIngest?.authConfig?.apiKey).toBe(SECRET_API_KEY);
    });
  });

  describe("users collection", () => {
    beforeAll(() => {
      setGraphqlDisabled(false);
    });

    it("does not expose the user list to an anonymous GraphQL query", async () => {
      const result = await gql(`query { Users(limit: 200) { docs { id email } } }`);

      expect(result.data?.Users?.docs ?? []).toHaveLength(0);
    });

    it("does not expose other users to a plain authenticated user", async () => {
      const token = await loginToken(otherUser.email);

      const result = await gql(`query { Users(limit: 200) { docs { id email } } }`, token);

      const emails = (result.data?.Users?.docs ?? []).map((d: { email: string }) => d.email);
      expect(emails).not.toContain(ownerUser.email);
      expect(emails).not.toContain(adminUser.email);
    });
  });
});
