import {defineArrayMember, defineField, defineType} from 'sanity'

export const page = defineType({
  name: 'page',
  title: 'Page',
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
      name: 'parent',
      title: 'Parent page',
      type: 'reference',
      to: [{type: 'page'}],
      weak: true,
    }),
    defineField({
      name: 'sections',
      title: 'Sections',
      type: 'array',
      of: [
        defineArrayMember({type: 'hero'}),
        defineArrayMember({type: 'textSection'}),
        defineArrayMember({type: 'productGrid'}),
      ],
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),
  ],
})
