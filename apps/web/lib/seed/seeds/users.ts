import type { User } from "../../../payload-types";

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

export function userSeeds(environment: string): UserSeed[] {
  const baseUsers: UserSeed[] = [
    {
      email: "admin@example.com",
      password: "admin123",
      firstName: "Admin",
      lastName: "User",
      role: "admin",
      isActive: true,
    },
    {
      email: "analyst@example.com",
      password: "analyst123",
      firstName: "Data",
      lastName: "Analyst",
      role: "analyst",
      isActive: true,
    },
  ];

  if (environment === "development") {
    return [
      ...baseUsers,
      {
        email: "john.doe@example.com",
        password: "password123",
        firstName: "John",
        lastName: "Doe",
        role: "user",
        isActive: true,
      },
      {
        email: "jane.smith@example.com",
        password: "password123",
        firstName: "Jane",
        lastName: "Smith",
        role: "user",
        isActive: true,
      },
      {
        email: "inactive.user@example.com",
        password: "password123",
        firstName: "Inactive",
        lastName: "User",
        role: "user",
        isActive: false,
      },
    ];
  }

  return baseUsers;
}
