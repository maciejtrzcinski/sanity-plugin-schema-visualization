import {useCallback} from 'react'
import {useTranslation} from 'sanity'

import {englishTemplate, interpolate, type TranslateFn} from '../i18n'
import {I18N_NAMESPACE} from '../i18nNamespace'

/**
 * Every call passes the English resource as `defaultValue`, so a missing key
 * reads as a sentence. Interpolated again on the way out: before the namespace
 * loads, i18next hands `defaultValue` back as the raw template.
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
