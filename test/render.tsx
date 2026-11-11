import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {ToastProvider} from '@sanity/ui/toast'
import {render, type RenderOptions, type RenderResult} from '@testing-library/react'
import {ReactFlowProvider} from '@xyflow/react'
import type {ReactElement, ReactNode} from 'react'
import {route, RouterProvider} from 'sanity/router'

import {ConfigProvider, type SchemaVisualizationOptions} from '../src/config'

const theme = buildTheme()

const router = route.create('/', [route.intents('/intent')])

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  options?: SchemaVisualizationOptions
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
