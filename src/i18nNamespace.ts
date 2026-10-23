/**
 * The namespace every string this plugin paints lives under — the name a
 * Studio registers its own locale bundle for.
 *
 * In its own module so `src/index.ts` can name it without statically
 * importing `src/i18n.ts`: a module reached both statically and dynamically
 * is hoisted into the static chunk, which would put the English bundle back
 * into the Studio's boot chunk.
 *
 * @public
 */
export const I18N_NAMESPACE = 'schema-visualization'
