import {defineField, defineType} from 'sanity'

// Health demo: no `title`, so the Studio labels it "Social Link", generated from
// the name. Sanity Lint's `missing-title` flags it.
export const socialLink = defineType({
  name: 'socialLink',
  type: 'object',
  fields: [
    defineField({
      name: 'platform',
      title: 'Platform',
      type: 'string',
      options: {
        list: ['x', 'instagram', 'linkedin', 'github', 'youtube'],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
  ],
})
