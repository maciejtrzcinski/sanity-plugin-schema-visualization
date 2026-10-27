import {defineField, defineType} from 'sanity'

export const review = defineType({
  name: 'review',
  title: 'Review',
  type: 'document',
  fields: [
    defineField({
      name: 'product',
      title: 'Product',
      type: 'reference',
      to: [{type: 'product'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'reviewer',
      title: 'Reviewer',
      type: 'reference',
      to: [{type: 'person'}],
    }),
    defineField({
      name: 'rating',
      title: 'Rating',
      type: 'number',
      validation: (Rule) => Rule.required().integer().min(1).max(5),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.max(120).warning(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
    }),
    defineField({
      name: 'verified',
      title: 'Verified purchase',
      type: 'boolean',
      readOnly: true,
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'product.title',
      // Health demo: review → product → brand, two references per list row.
      brand: 'product.brand.name',
    },
    prepare: ({title, subtitle, brand}) => ({
      title,
      subtitle: [subtitle, brand].filter(Boolean).join(' · '),
    }),
  },
})
