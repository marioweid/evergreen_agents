"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  getRoadmap,
  getRoadmapFilters,
  getRoadmapChanges,
} from "@/lib/api"
import type { RoadmapQuery } from "@/lib/api"
import type { RoadmapChange } from "@/types/api"

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

const CHANGE_BADGE: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  status_changed: { label: "Status", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  phase_changed: { label: "Phase", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
}

function ChangesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["roadmap-changes"],
    queryFn: () => getRoadmapChanges(200),
  })

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
      </div>
    )

  if (!data?.length)
    return (
      <p className="text-sm text-muted-foreground">
        No changes recorded yet. Trigger a sync to detect changes.
      </p>
    )

  // Group by sync_id, newest first
  const grouped = data.reduce<Record<string, RoadmapChange[]>>((acc, c) => {
    const bucket = acc[c.sync_id]
    if (bucket) {
      bucket.push(c)
    } else {
      acc[c.sync_id] = [c]
    }
    return acc
  }, {})
  const syncIds = Object.keys(grouped).sort().reverse()

  return (
    <div className="space-y-6">
      {syncIds.map((syncId) => {
        const changes = grouped[syncId] ?? []
        const syncDate = new Date(syncId)
        return (
          <div key={syncId}>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Sync — {syncDate.toLocaleString()}
              <span className="ml-2 text-muted-foreground/60">
                ({changes.length} change{changes.length !== 1 ? "s" : ""})
              </span>
            </p>
            <div className="space-y-1">
              {changes.map((c) => {
                const badge = CHANGE_BADGE[c.change_type] ?? { label: c.change_type, className: "" }
                return (
                  <div key={c.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                    <span
                      className={cn(
                        "shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.item_title}</p>
                      {(c.old_value || c.new_value) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.old_value && <span className="line-through mr-1">{c.old_value}</span>}
                          {c.new_value && <span>{c.new_value}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function RoadmapPage() {
  const [tab, setTab] = useState<"browse" | "changes">("browse")
  const [queryParams, setQueryParams] = useState<RoadmapQuery>({ limit: 50, offset: 0 })
  const [searchInput, setSearchInput] = useState("")
  const { data: filters } = useQuery({ queryKey: ["roadmap-filters"], queryFn: getRoadmapFilters })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["roadmap", queryParams],
    queryFn: () => getRoadmap(queryParams),
    enabled: tab === "browse",
  })

  const [expanded, setExpanded] = useState<number | null>(null)

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
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Roadmap</h1>
        <p className="text-sm text-muted-foreground">
          {tab === "browse"
            ? `${items.length} items shown${offset > 0 ? ` (${offset + 1}–${offset + items.length})` : ""}`
            : "Changes detected across syncs"}
        </p>
      </div>

      <div className="border-b px-6 flex gap-4">
        {(["browse", "changes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 text-sm border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "browse" && (
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
      )}

      <div className="flex-1 overflow-auto px-6 py-4 space-y-2">
        {tab === "changes" && <ChangesTab />}

        {tab === "browse" && (
          <>
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
                    {item.release_date && (
                      <p className="text-xs text-muted-foreground">{item.release_date}</p>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {expanded === item.id ? "▲" : "▼"}
                    </span>
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
          </>
        )}
      </div>
    </div>
  )
}
