import type { CollectionConfig } from "payload";

const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "firstName", "lastName", "role", "isActive"],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: "firstName",
      type: "text",
      maxLength: 100,
    },
    {
      name: "lastName",
      type: "text",
      maxLength: 100,
    },
    {
      name: "role",
      type: "select",
      options: [
        {
          label: "User",
          value: "user",
        },
        {
          label: "Admin",
          value: "admin",
        },
        {
          label: "Analyst",
          value: "analyst",
        },
      ],
      defaultValue: "user",
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "lastLoginAt",
      type: "date",
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        position: "sidebar",
        readOnly: true,
      },
    },
  ],
  timestamps: true,
};

export default Users;
