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

// Use Payload type with specific omissions for seed data
export type UserSeed = Omit<
  User,
  | "id"
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
};

export const userSeeds = (environment: string): UserSeed[] => {
  // Note: These are development/test seed passwords only.
  // In production, users should be created through proper authentication flows.

  const baseUsers: UserSeed[] = [
    {
      email: "admin@example.com",
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords
      password: "admin123", // Development seed password only
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
    },
    {
      email: "editor@example.com",
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords
      password: "editor123", // Development seed password only
      firstName: "Data",
      lastName: "Editor",
      role: "editor",
      isActive: true,
    },
  ];

  if (environment === "development") {
    return [
      ...baseUsers,
      {
        email: "john.doe@example.com",
        // eslint-disable-next-line sonarjs/no-hardcoded-passwords
        password: "password123", // Development seed password only
        firstName: "John",
        lastName: "Doe",
        role: "user",
        isActive: true,
      },
      {
        email: "jane.smith@example.com",
        // eslint-disable-next-line sonarjs/no-hardcoded-passwords
        password: "password123", // Development seed password only
        firstName: "Jane",
        lastName: "Smith",
        role: "user",
        isActive: true,
      },
      {
        email: "inactive.user@example.com",
        // eslint-disable-next-line sonarjs/no-hardcoded-passwords
        password: "password123", // Development seed password only
        firstName: "Inactive",
        lastName: "User",
        role: "user",
        isActive: false,
      },
    ];
  }

  return baseUsers;
};
