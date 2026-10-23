import type {SchemaTypeDefinition} from 'sanity'

import {author} from './author'
import {blockContent} from './blockContent'
import {category} from './category'
import {post} from './post'
import {seo} from './seo'
import {siteSettings} from './siteSettings'
import {socialLink} from './socialLink'

export const schemaTypes: SchemaTypeDefinition[] = [
  post,
  author,
  category,
  siteSettings,
  seo,
  blockContent,
  socialLink,
]
