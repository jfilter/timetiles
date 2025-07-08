import type { CollectionConfig } from 'payload'

const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['dataset', 'eventTimestamp', 'isValid', 'createdAt'],
    pagination: {
      defaultLimit: 50,
    },
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'dataset',
      type: 'relationship',
      relationTo: 'datasets',
      required: true,
      hasMany: false,
    },
    {
      name: 'import',
      type: 'relationship',
      relationTo: 'imports',
      hasMany: false,
      admin: {
        description: 'The import that created this event',
      },
    },
    {
      name: 'data',
      type: 'json',
      required: true,
      admin: {
        description: 'Event data in JSON format',
      },
    },
    {
      name: 'location',
      type: 'group',
      fields: [
        {
          name: 'latitude',
          type: 'number',
          admin: {
            step: 0.000001,
          },
        },
        {
          name: 'longitude',
          type: 'number',
          admin: {
            step: 0.000001,
          },
        },
      ],
      admin: {
        description: 'Geographic coordinates (WGS84)',
      },
    },
    {
      name: 'eventTimestamp',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        description: 'When the actual event occurred',
      },
    },
    {
      name: 'isValid',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
        description: 'Whether this event passed validation',
      },
    },
    {
      name: 'validationErrors',
      type: 'json',
      admin: {
        description: 'Validation errors if any',
        condition: (data) => !data.isValid,
      },
    },
  ],
  timestamps: true,
}

export default Events
