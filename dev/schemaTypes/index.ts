import type {SchemaTypeDefinition} from 'sanity'

import {author} from './author'
import {blockContent} from './blockContent'
import {brand} from './brand'
import {callToAction} from './callToAction'
import {category} from './category'
import {event} from './event'
import {hero} from './hero'
import {page} from './page'
import {person} from './person'
import {post} from './post'
import {product} from './product'
import {productGrid} from './productGrid'
import {review} from './review'
import {seo} from './seo'
import {siteSettings} from './siteSettings'
import {socialLink} from './socialLink'
import {testimonial} from './testimonial'
import {textSection} from './textSection'

// Types and fields marked "Health demo" break a health rule on purpose, so the
// Health panel has something to show.
export const schemaTypes: SchemaTypeDefinition[] = [
  post,
  author,
  category,
  page,
  product,
  brand,
  review,
  event,
  person,
  siteSettings,
  seo,
  blockContent,
  socialLink,
  hero,
  callToAction,
  textSection,
  productGrid,
  testimonial,
]
