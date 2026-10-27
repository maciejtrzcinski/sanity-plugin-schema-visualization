import {defineArrayMember, defineField, defineType} from 'sanity'

export const event = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'startsAt',
      title: 'Starts at',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'endsAt',
      title: 'Ends at',
      type: 'datetime',
      validation: (Rule) => Rule.min(Rule.valueOfField('startsAt')),
    }),
    defineField({
      // Health demo: required but hidden, so no editor can fill it in and
      // every event fails validation.
      name: 'timezone',
      title: 'Timezone',
      type: 'string',
      hidden: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'format',
      title: 'Format',
      type: 'string',
      options: {
        list: ['in-person', 'online', 'hybrid'],
        layout: 'radio',
      },
      initialValue: 'in-person',
    }),
    defineField({
      name: 'venue',
      title: 'Venue',
      type: 'object',
      hidden: ({parent}) => parent?.format === 'online',
      fields: [
        defineField({name: 'name', title: 'Name', type: 'string'}),
        defineField({name: 'address', title: 'Address', type: 'text', rows: 2}),
        defineField({name: 'city', title: 'City', type: 'string'}),
      ],
    }),
    defineField({
      name: 'registrationUrl',
      title: 'Registration URL',
      type: 'url',
      validation: (Rule) => Rule.uri({scheme: ['https']}),
    }),
    defineField({
      name: 'speakers',
      title: 'Speakers',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'person'}]})],
    }),
    defineField({
      name: 'relatedProducts',
      title: 'Related products',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'product'}], weak: true})],
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'blockContent',
    }),
  ],
})
