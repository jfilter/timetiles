import type { CollectionConfig } from 'payload'

const Imports: CollectionConfig = {
  slug: 'imports',
  admin: {
    useAsTitle: 'originalName',
    defaultColumns: ['originalName', 'catalog', 'status', 'rowCount', 'errorCount', 'importedAt'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'fileName',
      type: 'text',
      required: true,
      maxLength: 255,
      admin: {
        description: 'System file name',
      },
    },
    {
      name: 'originalName',
      type: 'text',
      maxLength: 255,
      admin: {
        description: 'Original user-friendly file name',
      },
    },
    {
      name: 'catalog',
      type: 'relationship',
      relationTo: 'catalogs',
      required: true,
      hasMany: false,
    },
    {
      name: 'fileSize',
      type: 'number',
      admin: {
        description: 'File size in bytes',
      },
    },
    {
      name: 'mimeType',
      type: 'text',
      maxLength: 100,
      admin: {
        description: 'MIME type of the uploaded file',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        {
          label: 'Pending',
          value: 'pending',
        },
        {
          label: 'Processing',
          value: 'processing',
        },
        {
          label: 'Completed',
          value: 'completed',
        },
        {
          label: 'Failed',
          value: 'failed',
        },
      ],
      defaultValue: 'pending',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
    },
    {
      name: 'completedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
        condition: (data) => data.status === 'completed',
      },
    },
    {
      name: 'rowCount',
      type: 'number',
      required: true,
      admin: {
        description: 'Total number of rows processed',
      },
    },
    {
      name: 'errorCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Number of rows that failed processing',
      },
    },
    {
      name: 'errorLog',
      type: 'textarea',
      admin: {
        description: 'Detailed error information',
        condition: (data) => data.errorCount > 0,
      },
    },
    {
      name: 'metadata',
      type: 'json',
      admin: {
        description: 'Additional import context and metadata',
      },
    },
  ],
  timestamps: true,
}

export default Imports
