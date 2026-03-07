"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { getRoadmap, getRoadmapFilters } from "@/lib/api"
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
  const [queryParams, setQueryParams] = useState<RoadmapQuery>({ limit: 50 })
  const [searchInput, setSearchInput] = useState("")

  const { data: filters } = useQuery({ queryKey: ["roadmap-filters"], queryFn: getRoadmapFilters })

  const { data: items, isLoading, isFetching } = useQuery({
    queryKey: ["roadmap", queryParams],
    queryFn: () => getRoadmap(queryParams),
  })

  const [expanded, setExpanded] = useState<number | null>(null)

  function search() {
    setQueryParams((prev) => ({ ...prev, q: searchInput.trim() || undefined }))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") search()
  }

  function setFilter(key: keyof RoadmapQuery, value: string) {
    setQueryParams((prev) => ({ ...prev, [key]: value || undefined }))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Roadmap</h1>
        <p className="text-sm text-muted-foreground">M365 roadmap items — {items?.length ?? 0} shown</p>
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
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {items?.map((item) => (
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
        {items?.length === 0 && <p className="text-sm text-muted-foreground">No items found.</p>}
      </div>
    </div>
  )
}
