import {defineArrayMember, defineField, defineType} from 'sanity'

export const product = defineType({
  name: 'product',
  title: 'Product',
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
      name: 'sku',
      title: 'SKU',
      type: 'string',
      validation: (Rule) =>
        Rule.required().regex(/^[A-Z0-9-]+$/, {name: 'uppercase letters, digits and dashes'}),
    }),
    defineField({
      name: 'legacySku',
      title: 'Legacy SKU',
      type: 'string',
      readOnly: true,
      deprecated: {reason: 'Kept for the old storefront import; use `sku`.'},
    }),
    defineField({
      name: 'price',
      title: 'Price',
      type: 'number',
      validation: (Rule) => Rule.required().min(0).precision(2),
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
      options: {
        list: ['EUR', 'USD', 'PLN'],
        layout: 'radio',
      },
      initialValue: 'EUR',
    }),
    defineField({
      // Health demo: `brand` is deprecated.
      name: 'brand',
      title: 'Brand',
      type: 'reference',
      to: [{type: 'brand'}],
    }),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'category'}]})],
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [defineArrayMember({type: 'image', options: {hotspot: true}})],
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'blockContent',
    }),
    defineField({
      // Health demo: `callToAction` is an object, and a reference can only
      // point at a document.
      name: 'promo',
      title: 'Promo',
      type: 'reference',
      to: [{type: 'callToAction'}],
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),
  ],
})
