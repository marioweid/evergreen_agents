"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Search, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { getRoadmap, getRoadmapFilters, getPipelineStatus, triggerPipeline } from "@/lib/api"
import type { RoadmapQuery } from "@/lib/api"

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <select
      className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export default function RoadmapPage() {
  const qc = useQueryClient()
  const [queryParams, setQueryParams] = useState<RoadmapQuery>({ limit: 50, offset: 0 })
  const [searchInput, setSearchInput] = useState("")
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const { data: filters } = useQuery({ queryKey: ["roadmap-filters"], queryFn: getRoadmapFilters })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["roadmap", queryParams],
    queryFn: () => getRoadmap(queryParams),
  })

  const { data: pipelineStatus } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: getPipelineStatus,
    refetchInterval: syncing ? 2000 : false,
  })

  const [expanded, setExpanded] = useState<number | null>(null)

  async function sync() {
    setSyncing(true)
    setSyncError(null)
    try {
      await triggerPipeline()
      // Poll until done
      const poll = setInterval(async () => {
        const status = await getPipelineStatus()
        void qc.setQueryData(["pipeline-status"], status)
        if (!status.running) {
          clearInterval(poll)
          setSyncing(false)
          if (status.error) {
            setSyncError(status.error)
          } else {
            void qc.invalidateQueries({ queryKey: ["roadmap"] })
            void qc.invalidateQueries({ queryKey: ["roadmap-filters"] })
          }
        }
      }, 2000)
    } catch (err) {
      setSyncing(false)
      setSyncError(err instanceof Error ? err.message : "Sync failed.")
    }
  }

  function search() {
    setQueryParams((prev) => ({ ...prev, q: searchInput.trim() || undefined, offset: 0 }))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") search()
  }

  function setFilter(key: keyof RoadmapQuery, value: string) {
    setQueryParams((prev) => ({ ...prev, [key]: value || undefined, offset: 0 }))
  }

  const limit = queryParams.limit ?? 50
  const offset = queryParams.offset ?? 0
  const items = data?.items ?? []
  const hasMore = data?.has_more ?? false
  const hasPrev = offset > 0

  function nextPage() {
    setQueryParams((prev) => ({ ...prev, offset: (prev.offset ?? 0) + limit }))
  }

  function prevPage() {
    setQueryParams((prev) => ({ ...prev, offset: Math.max(0, (prev.offset ?? 0) - limit) }))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Roadmap</h1>
          <p className="text-sm text-muted-foreground">
            M365 roadmap items — {items.length} shown{offset > 0 ? ` (${offset + 1}–${offset + items.length})` : ""}
            {pipelineStatus?.last_run && !syncing && (
              <span> · Last synced {new Date(pipelineStatus.last_run).toLocaleString()}</span>
            )}
          </p>
          {syncError && <p className="text-xs text-destructive mt-0.5">{syncError}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing}>
          <RefreshCw size={14} className={syncing ? "mr-2 animate-spin" : "mr-2"} />
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      <div className="border-b px-6 py-3 flex flex-wrap gap-2">
        <div className="flex gap-2 flex-1 min-w-[240px]">
          <Input
            placeholder="Semantic search…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={onKeyDown}
            className="max-w-sm"
          />
          <Button variant="outline" size="icon" onClick={search} disabled={isFetching}>
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="All products"
            options={filters?.products ?? []}
            value={queryParams.product ?? ""}
            onChange={(v) => setFilter("product", v)}
          />
          <FilterSelect
            label="All statuses"
            options={filters?.statuses ?? []}
            value={queryParams.status ?? ""}
            onChange={(v) => setFilter("status", v)}
          />
          <FilterSelect
            label="All phases"
            options={filters?.release_phases ?? []}
            value={queryParams.release_phase ?? ""}
            onChange={(v) => setFilter("release_phase", v)}
          />
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={queryParams.release_date_from ?? ""}
            onChange={(e) => setFilter("release_date_from", e.target.value)}
            aria-label="From date"
          />
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={queryParams.release_date_to ?? ""}
            onChange={(e) => setFilter("release_date_to", e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border">
            <button
              className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.status && <Badge variant="outline">{item.status}</Badge>}
                  {item.release_phase && <Badge variant="secondary">{item.release_phase}</Badge>}
                  {item.products.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {item.release_date && <p className="text-xs text-muted-foreground">{item.release_date}</p>}
                <span className="text-xs text-muted-foreground">{expanded === item.id ? "▲" : "▼"}</span>
              </div>
            </button>
            {expanded === item.id && item.description && (
              <div className="border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            )}
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No items found.</p>
        )}
        {(hasPrev || hasMore) && (
          <div className="flex items-center justify-between pt-2 pb-1">
            <Button
              variant="outline"
              size="sm"
              onClick={prevPage}
              disabled={!hasPrev || isFetching}
            >
              <ChevronLeft size={14} className="mr-1" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {offset + 1}–{offset + items.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={nextPage}
              disabled={!hasMore || isFetching}
            >
              Next <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
