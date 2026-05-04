/**
 * Seed data for the Users collection.
 *
 * It defines a set of predefined user accounts with different roles (admin, editor, user)
 * that can be used to populate the database. This is essential for development and testing,
 * as it provides a consistent set of users for logging in and testing role-based access
 * control and other user-specific features.
 *
 * @module
 */
import type { User } from "@/payload-types";

import { SEED_USER_API_KEYS, SEED_USER_PASSWORDS } from "./seed-credentials";

// Use Payload type with specific omissions for seed data
export type UserSeed = Omit<
  User,
  | "id"
  | "collection"
  | "createdAt"
  | "updatedAt"
  | "salt"
  | "hash"
  | "resetPasswordToken"
  | "resetPasswordExpiration"
  | "loginAttempts"
  | "lockUntil"
> & {
  password: string; // Plain password for seeding, will be hashed
  enableAPIKey?: boolean;
  apiKey?: string;
};

export const userSeeds = (environment: string): UserSeed[] => {
  // Note: These are development/test seed passwords only.
  // In production, users should be created through proper authentication flows.

  const baseUsers: UserSeed[] = [
    {
      email: "admin@example.com",
      password: SEED_USER_PASSWORDS.admin, // Development seed password only
      enableAPIKey: true,
      apiKey: SEED_USER_API_KEYS.admin,
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      trustLevel: "5", // UNLIMITED
      isActive: true,
      _verified: true, // Pre-verified for testing
    },
    {
      email: "editor@example.com",

      password: SEED_USER_PASSWORDS.editor, // Development seed password only
      firstName: "Data",
      lastName: "Editor",
      role: "editor",
      trustLevel: "3", // TRUSTED
      isActive: true,
      _verified: true, // Pre-verified for testing
    },
  ];

  if (environment === "development") {
    return [
      ...baseUsers,
      // Demo user with simple credentials for quick testing
      {
        email: "demo@example.com",

        password: SEED_USER_PASSWORDS.demo, // Development seed password only
        firstName: "Demo",
        lastName: "User",
        role: "user",
        trustLevel: "2", // REGULAR
        isActive: true,
        _verified: true, // Pre-verified for testing
      },
      {
        email: "john.doe@example.com",

        password: SEED_USER_PASSWORDS.strong, // Development seed password only
        firstName: "John",
        lastName: "Doe",
        role: "user",
        trustLevel: "2", // REGULAR
        isActive: true,
        _verified: true, // Pre-verified for testing
      },
      {
        email: "jane.smith@example.com",

        password: SEED_USER_PASSWORDS.strong, // Development seed password only
        firstName: "Jane",
        lastName: "Smith",
        role: "user",
        trustLevel: "2", // REGULAR
        isActive: true,
        _verified: true, // Pre-verified for testing
      },
      {
        email: "inactive.user@example.com",

        password: SEED_USER_PASSWORDS.strong, // Development seed password only
        firstName: "Inactive",
        lastName: "User",
        role: "user",
        trustLevel: "1", // BASIC
        isActive: false,
        _verified: true, // Pre-verified for testing
      },
    ];
  }

  return baseUsers;
};
