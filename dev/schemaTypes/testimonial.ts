import {defineField, defineType} from 'sanity'

// Health demo: no field uses this type. It was meant to be one of
// `page.sections` and never got added there.
export const testimonial = defineType({
  name: 'testimonial',
  title: 'Testimonial',
  type: 'object',
  fields: [
    defineField({
      name: 'quote',
      title: 'Quote',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'person',
      title: 'Person',
      type: 'reference',
      to: [{type: 'person'}],
    }),
    defineField({
      name: 'company',
      title: 'Company',
      type: 'string',
    }),
  ],
})
