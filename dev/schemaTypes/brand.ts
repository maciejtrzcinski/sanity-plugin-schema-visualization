import {defineField, defineType} from 'sanity'

export const brand = defineType({
  name: 'brand',
  title: 'Brand',
  type: 'document',
  // Health demo: `product.brand` still references this type.
  deprecated: {reason: 'Brands are moving to categories, so reference `category` instead.'},
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      // Health demo: a slug with no `source` leaves editors typing it by hand.
      name: 'slug',
      title: 'Slug',
      type: 'slug',
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
    }),
  ],
})
