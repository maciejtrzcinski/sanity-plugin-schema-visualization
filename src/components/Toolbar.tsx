import {ArrowRightIcon} from '@sanity/icons/ArrowRight'
import {CheckmarkIcon} from '@sanity/icons/Checkmark'
import {ChevronDownIcon} from '@sanity/icons/ChevronDown'
import {CogIcon} from '@sanity/icons/Cog'
import {CopyIcon} from '@sanity/icons/Copy'
import {FilterIcon} from '@sanity/icons/Filter'
import {ResetIcon} from '@sanity/icons/Reset'
import {SearchIcon} from '@sanity/icons/Search'
import {WarningOutlineIcon} from '@sanity/icons/WarningOutline'
import {Badge, Box, Button, Card, Flex, Text, TextInput} from '@sanity/ui'
import {Autocomplete, type BaseAutocompleteOption} from '@sanity/ui/autocomplete'
import {Menu, MenuButton, MenuDivider, MenuGroup, MenuItem} from '@sanity/ui/menu'
import {Tooltip} from '@sanity/ui/tooltip'
import {memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'

import {useConfig} from '../config'
import {
  activeFilterCount,
  selectionFor,
  type FilterContext,
  type FilterDef,
  type FilterValues,
} from '../filters'
import {severityTone} from '../healthRules'
import type {GraphStats} from '../hooks/useGraphModel'
import {useTranslate} from '../hooks/useTranslate'
import type {ViewState} from '../hooks/useViewState'
import {localized, type TranslateFn} from '../i18n'
import {statsLine} from '../statsLine'
import type {GraphNodeKind} from '../types'

const SEARCH_DEBOUNCE_MS = 200

const ALL_TYPES_VALUE = ''

const ISSUES_URL = 'https://github.com/maciejtrzcinski/sanity-plugin-schema-visualization/issues'

interface FocusOption extends BaseAutocompleteOption {
  title: string
  /** Pre-rendered so the option's label doesn't need the kind registry to read it. */
  kindLabel: string | null
  isSystem: boolean
}

function focusOptionLabel(option: FocusOption, t: TranslateFn): string {
  if (option.kindLabel === null) return t('toolbar.focus.all')
  const key = option.isSystem ? 'toolbar.focus.only-system' : 'toolbar.focus.only'
  return t(key, {title: option.title, kind: option.kindLabel})
}

export interface ToolbarProps {
  /**
   * The shared view state, straight from `useViewState`. Passed whole rather
   * than spread into ~15 props: every one of them would have to be threaded
   * through `SchemaVisualizationTool` and re-listed here to add a single
   * control.
   */
  view: ViewState
  /** What each filter's `summary` sees — the same context its predicate gets. */
  filterContext: FilterContext
  stats: GraphStats
  focusOptions: Array<{id: string; title: string; isSystem: boolean; kind: GraphNodeKind}>
  healthIssueCount: number
  /** The `warning`-severity share of `healthIssueCount` — decides the button's tone. */
  healthWarningCount: number
  showHealthPanel: boolean
  onToggleHealthPanel: () => void
  onCopyLink: () => void
  /**
   * Controls an optional feature contributes to the toolbar's action row,
   * rendered after "Copy link". A slot rather than a prop per feature: this
   * file knows nothing about what it is rendering, so a feature ships its own
   * button without editing the toolbar — see `DocumentCountsButton`, the one
   * that does today.
   */
  extraActions?: ReactNode
}

/**
 * The focus combobox, memoised apart from the rest of the toolbar: it renders
 * a row per type, and every selection change re-renders the toolbar — 331
 * rows re-rendered per click on a large schema, for a list that hadn't
 * changed.
 */
const FocusPicker = memo(function FocusPicker({
  options,
  focusNodeId,
  onChange,
}: {
  options: FocusOption[]
  focusNodeId: string | null
  onChange: (id: string | null) => void
}) {
  const t = useTranslate()
  const filterOption = useCallback(
    (query: string, option: FocusOption) =>
      focusOptionLabel(option, t).toLowerCase().includes(query.toLowerCase()),
    [t],
  )
  const renderValue = useCallback(
    (value: string, option?: FocusOption) => (option ? focusOptionLabel(option, t) : value),
    [t],
  )
  const renderOption = useCallback(
    (option: FocusOption) => (
      <Card as="button" padding={2} radius={2} tone="inherit">
        <Text size={1} textOverflow="ellipsis">
          {focusOptionLabel(option, t)}
        </Text>
      </Card>
    ),
    [t],
  )
  const handleChange = useCallback(
    (value: string) => onChange(value === ALL_TYPES_VALUE ? null : value),
    [onChange],
  )

  return (
    <Autocomplete<FocusOption>
      id="focus-combobox"
      fontSize={1}
      padding={2}
      openButton
      options={options}
      value={focusNodeId ?? ALL_TYPES_VALUE}
      filterOption={filterOption}
      renderValue={renderValue}
      onChange={handleChange}
      renderOption={renderOption}
    />
  )
})

export function Toolbar({
  view,
  filterContext,
  stats,
  focusOptions,
  healthIssueCount,
  healthWarningCount,
  showHealthPanel,
  onToggleHealthPanel,
  onCopyLink,
  extraActions,
}: ToolbarProps) {
  const {
    searchQuery,
    setSearchQuery: onSearchQueryChange,
    filters,
    toggleFilterValue: onToggleFilterValue,
    setFilterValue: onSetFilterValue,
    clearFilters: onClearFilters,
    direction,
    setDirection: onDirectionChange,
    relayout: onRelayout,
    focusNodeId,
    setFocus: onFocusNodeIdChange,
    compactMode,
    setCompactMode: onCompactModeChange,
  } = view
  const {filters: filterDefs, kindById, catchAll} = useConfig()
  const t = useTranslate()

  // The input updates instantly for responsive typing, but propagation to
  // `searchQuery` (which drives matching/dimming across every node in
  // `GraphCanvas`) is debounced so fast typing doesn't force a full-graph
  // re-render on every keystroke. `searchQuery` is only ever set from this
  // debounce, never from outside, so `localSearch` doesn't need to re-sync
  // from the prop.
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setLocalSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onSearchQueryChange(value), SEARCH_DEBOUNCE_MS)
  }

  const handleSearchClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLocalSearch('')
    onSearchQueryChange('')
  }

  const filterCount = activeFilterCount(filters, filterDefs)

  const summary = useMemo(
    () => statsLine(stats, filters, filterDefs, filterContext, t),
    [stats, filters, filterDefs, filterContext, t],
  )

  const focusComboOptions = useMemo<FocusOption[]>(
    () => [
      {value: ALL_TYPES_VALUE, title: t('toolbar.focus.all'), kindLabel: null, isSystem: false},
      ...focusOptions.map((opt) => {
        const kind = kindById.get(opt.kind) ?? catchAll
        return {
          value: opt.id,
          title: opt.title,
          kindLabel: localized(t, kind.i18n?.singular, kind.singular),
          isSystem: opt.isSystem,
        }
      }),
    ],
    [focusOptions, kindById, catchAll, t],
  )

  return (
    <Card padding={3} borderBottom>
      <Flex align="center" gap={3} wrap="wrap">
        <Box style={{minWidth: 240, flex: '1 1 240px'}}>
          <TextInput
            icon={SearchIcon}
            placeholder={t('toolbar.search-placeholder')}
            value={localSearch}
            onChange={(event) => handleSearchChange(event.currentTarget.value)}
            clearButton={localSearch.length > 0}
            onClear={handleSearchClear}
          />
        </Box>

        <Box style={{minWidth: 220, flex: '1 1 220px'}}>
          <FocusPicker
            options={focusComboOptions}
            focusNodeId={focusNodeId}
            onChange={onFocusNodeIdChange}
          />
        </Box>

        <MenuButton
          id="filter-menu"
          button={
            <Button
              icon={FilterIcon}
              iconRight={ChevronDownIcon}
              mode={filterCount > 0 ? 'default' : 'ghost'}
              tone={filterCount > 0 ? 'primary' : 'default'}
              text={
                filterCount > 0
                  ? t('toolbar.filter-active', {count: filterCount})
                  : t('toolbar.filter')
              }
              fontSize={1}
              padding={2}
            />
          }
          popover={{portal: true, placement: 'bottom-start'}}
          menu={
            <Menu>
              <MenuItem
                text={t('toolbar.clear-filters')}
                icon={ResetIcon}
                disabled={filterCount === 0}
                onClick={onClearFilters}
              />
              {filterDefs.map((def) => (
                <FilterMenuSection
                  key={def.id}
                  def={def}
                  filters={filters}
                  onToggleFilterValue={onToggleFilterValue}
                  onSetFilterValue={onSetFilterValue}
                />
              ))}
            </Menu>
          }
        />

        <MenuButton
          id="view-menu"
          button={
            <Button
              icon={CogIcon}
              iconRight={ChevronDownIcon}
              mode="ghost"
              text={t('toolbar.view')}
              fontSize={1}
              padding={2}
            />
          }
          popover={{portal: true, placement: 'bottom-start'}}
          menu={
            <Menu>
              <MenuItem
                text={t('toolbar.compact-nodes')}
                icon={compactMode ? CheckmarkIcon : undefined}
                pressed={compactMode}
                onClick={() => onCompactModeChange(!compactMode)}
              />
              <MenuDivider />
              <Box padding={2} paddingBottom={1}>
                <Text size={0} weight="semibold" muted>
                  {t('toolbar.layout-direction')}
                </Text>
              </Box>
              <MenuItem
                text={t('toolbar.direction-horizontal')}
                icon={direction === 'LR' ? CheckmarkIcon : undefined}
                pressed={direction === 'LR'}
                onClick={() => onDirectionChange('LR')}
              />
              <MenuItem
                text={t('toolbar.direction-vertical')}
                icon={direction === 'TB' ? CheckmarkIcon : undefined}
                pressed={direction === 'TB'}
                onClick={() => onDirectionChange('TB')}
              />
              <MenuDivider />
              <MenuItem text={t('toolbar.relayout')} icon={ArrowRightIcon} onClick={onRelayout} />
            </Menu>
          }
        />

        <Button
          icon={WarningOutlineIcon}
          mode={showHealthPanel ? 'default' : 'ghost'}
          tone={
            healthIssueCount > 0
              ? severityTone(healthWarningCount > 0 ? 'warning' : 'info')
              : 'default'
          }
          text={
            healthIssueCount > 0
              ? t('toolbar.health-active', {count: healthIssueCount})
              : t('toolbar.health')
          }
          fontSize={1}
          padding={2}
          onClick={onToggleHealthPanel}
        />

        <Button
          icon={CopyIcon}
          mode="ghost"
          text={t('toolbar.copy-link')}
          fontSize={1}
          padding={2}
          onClick={onCopyLink}
        />

        {extraActions}

        <Flex align="center" gap={3} flex="none" style={{marginLeft: 'auto'}}>
          <Text size={1} muted>
            {summary}
          </Text>
          <Tooltip
            content={
              <Box padding={2} style={{maxWidth: 260}}>
                <Text size={1}>{t('toolbar.beta-tooltip')}</Text>
              </Box>
            }
            placement="bottom-end"
            portal
          >
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              aria-label={t('toolbar.beta-tooltip')}
              style={{display: 'inline-flex', textDecoration: 'none'}}
            >
              <Badge tone="caution">{t('toolbar.beta')}</Badge>
            </a>
          </Tooltip>
        </Flex>
      </Flex>
    </Card>
  )
}

/**
 * One filter's controls, rendered from its definition. A `multi` filter is a
 * flat list of independently toggleable items; a `single` filter is a
 * radio-style submenu. Either way the toolbar knows nothing about what the
 * filter actually does — adding one means adding a `FilterDef`, not editing
 * this file.
 */
function FilterMenuSection({
  def,
  filters,
  onToggleFilterValue,
  onSetFilterValue,
}: {
  def: FilterDef
  filters: FilterValues
  onToggleFilterValue: (def: FilterDef, value: string) => void
  onSetFilterValue: (def: FilterDef, value: string) => void
}) {
  const t = useTranslate()
  const selected = selectionFor(filters, def)

  if (def.type === 'multi') {
    return (
      <>
        <MenuDivider />
        <Box padding={2} paddingBottom={1}>
          <Text size={0} weight="semibold" muted>
            {localized(t, def.i18n?.label, def.label)}
          </Text>
        </Box>
        {def.options.map((option) => (
          <MenuItem
            key={option.value}
            text={localized(t, option.i18n?.label, option.label)}
            icon={selected.values.has(option.value) ? CheckmarkIcon : undefined}
            pressed={selected.values.has(option.value)}
            // The last checked option can't be unchecked — an empty selection
            // would hide every node. Disabling it says so before the click.
            disabled={selected.values.size === 1 && selected.values.has(option.value)}
            onClick={() => onToggleFilterValue(def, option.value)}
          />
        ))}
      </>
    )
  }

  return (
    <>
      <MenuDivider />
      <MenuGroup
        text={localized(t, def.i18n?.label, def.label)}
        icon={def.icon}
        popover={{placement: 'right-start'}}
      >
        {def.options.map((option) => (
          <MenuItem
            key={option.value}
            text={localized(t, option.i18n?.label, option.label)}
            icon={selected.value === option.value ? CheckmarkIcon : undefined}
            pressed={selected.value === option.value}
            onClick={() => onSetFilterValue(def, option.value)}
          />
        ))}
      </MenuGroup>
    </>
  )
}
