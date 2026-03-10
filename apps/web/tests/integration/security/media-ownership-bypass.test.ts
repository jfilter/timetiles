// @vitest-environment node
/**
 * Security tests verifying Media collection ownership cannot be spoofed.
 *
 * The vulnerability: update/delete access functions check `data.createdBy`
 * (the incoming request payload) instead of the persisted document owner.
 * An attacker can inject `createdBy` set to their own ID to bypass ownership.
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Media, User } from "@/payload-types";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

/** Create a minimal 1x1 PNG buffer for media upload tests */
const createTestImageBuffer = (): Buffer => {
  // Minimal valid 1x1 white PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64"
  );
};

/** Helper to create a media record with a real uploaded file */
const createMediaForUser = (payload: any, user: User, alt: string): Promise<Media> => {
  return payload.create({
    collection: "media",
    data: { alt },
    file: {
      data: createTestImageBuffer(),
      mimetype: "image/png",
      name: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
      size: 68,
    },
    user,
  });
};

describe.sequential("Media Ownership Bypass Vulnerability", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let adminUser: User;
  let ownerUser: User;
  let attackerUser: User;

  let ownerMedia: Media;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, {
      adminUser: { role: "admin" },
      ownerUser: { role: "user" },
      attackerUser: { role: "user" },
    });
    adminUser = users.adminUser;
    ownerUser = users.ownerUser;
    attackerUser = users.attackerUser;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Create a media record owned by ownerUser
    ownerMedia = await createMediaForUser(payload, ownerUser, "owner photo");
  });

  describe("Vulnerability: attacker-controlled createdBy in update", () => {
    it("should reject update when attacker injects createdBy to spoof ownership", async () => {
      // Attacker tries to update owner's media by injecting their own ID as createdBy
      await expect(
        payload.update({
          collection: "media",
          id: ownerMedia.id,
          data: { alt: "hacked", createdBy: attackerUser.id },
          user: attackerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });

    it("should reject delete when attacker injects createdBy to spoof ownership", async () => {
      await expect(
        payload.delete({ collection: "media", id: ownerMedia.id, user: attackerUser, overrideAccess: false })
      ).rejects.toThrow();
    });
  });

  describe("Legitimate access after fix", () => {
    it("owner can update their own media", async () => {
      const updated = await payload.update({
        collection: "media",
        id: ownerMedia.id,
        data: { alt: "updated by owner" },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(updated.alt).toBe("updated by owner");
    });

    it("owner can delete their own media", async () => {
      const deleted = await payload.delete({
        collection: "media",
        id: ownerMedia.id,
        user: ownerUser,
        overrideAccess: false,
      });
      expect(deleted.id).toBe(ownerMedia.id);
    });

    it("admin can update any media", async () => {
      const updated = await payload.update({
        collection: "media",
        id: ownerMedia.id,
        data: { alt: "updated by admin" },
        user: adminUser,
        overrideAccess: false,
      });
      expect(updated.alt).toBe("updated by admin");
    });

    it("admin can delete any media", async () => {
      const deleted = await payload.delete({
        collection: "media",
        id: ownerMedia.id,
        user: adminUser,
        overrideAccess: false,
      });
      expect(deleted.id).toBe(ownerMedia.id);
    });

    it("attacker cannot update media without injecting createdBy", async () => {
      await expect(
        payload.update({
          collection: "media",
          id: ownerMedia.id,
          data: { alt: "hacked" },
          user: attackerUser,
          overrideAccess: false,
        })
      ).rejects.toThrow();
    });
  });
});
