import {defineField, defineType} from 'sanity'

export const callToAction = defineType({
  name: 'callToAction',
  title: 'Call to action',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
      validation: (Rule) => Rule.required().max(30),
    }),
    defineField({
      name: 'internalLink',
      title: 'Internal link',
      type: 'reference',
      to: [{type: 'page'}, {type: 'product'}, {type: 'post'}],
    }),
    defineField({
      name: 'externalUrl',
      title: 'External URL',
      type: 'url',
      hidden: ({parent}) => Boolean(parent?.internalLink),
    }),
    defineField({
      name: 'style',
      title: 'Style',
      type: 'string',
      options: {
        list: ['primary', 'secondary', 'link'],
        layout: 'radio',
      },
      initialValue: 'primary',
    }),
  ],
})
