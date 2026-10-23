import {defineField, defineType} from 'sanity'

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Site title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Site description',
      type: 'text',
    }),
    defineField({
      name: 'featuredPosts',
      title: 'Featured posts',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'post'}]}],
    }),
    defineField({
      name: 'socialLinks',
      title: 'Social links',
      type: 'array',
      of: [{type: 'socialLink'}],
    }),
    defineField({
      // The other half of the external-reference story: a pointer at a
      // document in a different resource entirely, named
      // `resourceType:resourceId` rather than by dataset.
      name: 'houseAuthor',
      title: 'House author',
      type: 'globalDocumentReference',
      resourceType: 'dataset',
      resourceId: 'your-project-id.shared',
      to: [{type: 'author', preview: {select: {title: 'name'}}}],
    }),
    defineField({
      name: 'seo',
      title: 'Default SEO',
      type: 'seo',
    }),
  ],
})
