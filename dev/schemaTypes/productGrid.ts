import {defineArrayMember, defineField, defineType} from 'sanity'

export const productGrid = defineType({
  name: 'productGrid',
  title: 'Product grid',
  type: 'object',
  fields: [
    defineField({
      name: 'heading',
      title: 'Heading',
      type: 'string',
    }),
    defineField({
      name: 'products',
      title: 'Products',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'product'}]})],
      validation: (Rule) => Rule.required().min(1).max(12),
    }),
    defineField({
      name: 'columns',
      title: 'Columns',
      type: 'number',
      options: {list: [2, 3, 4]},
      initialValue: 3,
    }),
  ],
})
