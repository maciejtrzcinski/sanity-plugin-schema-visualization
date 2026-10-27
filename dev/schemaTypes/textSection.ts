import {defineField, defineType} from 'sanity'

export const textSection = defineType({
  name: 'textSection',
  title: 'Text section',
  type: 'object',
  fields: [
    defineField({
      name: 'heading',
      title: 'Heading',
      type: 'string',
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
    }),
    defineField({
      name: 'cta',
      title: 'Call to action',
      type: 'callToAction',
    }),
  ],
})
