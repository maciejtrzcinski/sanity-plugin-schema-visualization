import {useCallback} from 'react'
import {useTranslation} from 'sanity'

import {englishTemplate, interpolate, type TranslateFn} from '../i18n'
import {I18N_NAMESPACE} from '../i18nNamespace'

/**
 * The Studio's translator, scoped to this plugin's namespace.
 *
 * Every call carries the English resource as i18next's `defaultValue`, which
 * covers the two ways a lookup can come back empty: a Studio that somehow
 * renders the tool before the bundle is registered, and a consumer's own
 * registry def naming a key no bundle defines. Either way the user reads a
 * sentence rather than a dotted key. The plural form is resolved here too, so
 * the fallback matches the `count` the caller passed.
 *
 * The result is interpolated once more on the way out. i18next has already
 * done it whenever it resolved the key itself, so this is a no-op then — but
 * the `defaultValue` it hands back before a namespace has loaded is the raw
 * template, placeholders and all, and that would otherwise reach the screen.
 */
export function useTranslate(): TranslateFn {
  const {t} = useTranslation(I18N_NAMESPACE)

  return useCallback<TranslateFn>(
    (key, values) => {
      const fallback =
        englishTemplate(key, values) ??
        (typeof values?.defaultValue === 'string' ? values.defaultValue : key)
      return interpolate(t(key, {...values, defaultValue: fallback}), values)
    },
    [t],
  )
}
