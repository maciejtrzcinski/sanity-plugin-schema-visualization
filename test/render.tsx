/**
 * Renders a component the way the tool root does: inside the Sanity UI theme
 * its cards and badges read tokens from, the plugin's resolved config, the
 * React Flow store that `Handle` and `useReactFlow` need, the toast context
 * the export controls report failures through, and a Studio router the detail
 * panel resolves its intent links against. Tests that want a custom registry
 * pass `options`, which goes through `resolveConfig` unchanged.
 *
 * No locale provider: `useTranslate` falls back to the plugin's own English
 * bundle when there is no i18next instance, which is exactly what the
 * assertions in these suites read. A test that needs another language should
 * assert the resource key it renders, not wire up i18next.
 */
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {ToastProvider} from '@sanity/ui/toast'
import {render, type RenderOptions, type RenderResult} from '@testing-library/react'
import {ReactFlowProvider} from '@xyflow/react'
import type {ReactElement, ReactNode} from 'react'
import {route, RouterProvider} from 'sanity/router'

import {ConfigProvider, type SchemaVisualizationOptions} from '../src/config'

const theme = buildTheme()

/**
 * The smallest router that can resolve an intent link: the Studio's own root
 * route shape, minus every tool. `useIntentLink` only needs somewhere to
 * resolve `/intent/...` to.
 */
const router = route.create('/', [route.intents('/intent')])

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  options?: SchemaVisualizationOptions
  /** Records the intent navigations a test triggers, in the order they happen. */
  onNavigate?: (opts: {path: string; replace?: boolean}) => void
}

export function renderWithProviders(
  ui: ReactElement,
  {options = {}, onNavigate = () => {}, ...rest}: RenderWithProvidersOptions = {},
): RenderResult {
  function Providers({children}: {children: ReactNode}) {
    return (
      <ThemeProvider theme={theme}>
        <ToastProvider>
          <RouterProvider router={router} state={{}} onNavigate={onNavigate}>
            <ConfigProvider options={options}>
              <ReactFlowProvider>{children}</ReactFlowProvider>
            </ConfigProvider>
          </RouterProvider>
        </ToastProvider>
      </ThemeProvider>
    )
  }

  return render(ui, {wrapper: Providers, ...rest})
}
