"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Users, Star, RefreshCw, Plus, XCircle, TrendingDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { getCustomers, getPipelineStatus, getRoadmapChanges } from "@/lib/api"
import type { RoadmapChange } from "@/types/api"

// ─── Types ────────────────────────────────────────────────────────────────────

type ChangeType = "new" | "status_changed" | "phase_changed" | "cancelled"

type SyncSummary = {
  syncId: string
  new: number
  status_changed: number
  phase_changed: number
  cancelled: number
  total: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHANGE_BADGE: Record<ChangeType, { label: string; className: string }> = {
  new:            { label: "New",       className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  status_changed: { label: "Status",    className: "bg-blue-100  text-blue-800  dark:bg-blue-900  dark:text-blue-200"  },
  phase_changed:  { label: "Phase",     className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  cancelled:      { label: "Cancelled", className: "bg-red-100   text-red-800   dark:bg-red-900   dark:text-red-200"   },
}

const CHART_COLORS: Record<ChangeType, string> = {
  new:            "#22c55e",
  status_changed: "#3b82f6",
  phase_changed:  "#f59e0b",
  cancelled:      "#ef4444",
}

function lastSyncChanges(changes: RoadmapChange[]): RoadmapChange[] {
  if (!changes.length) return []
  const latest = [...changes].sort((a, b) => b.sync_id.localeCompare(a.sync_id))[0]!.sync_id
  return changes.filter((c) => c.sync_id === latest)
}

function buildSyncHistory(changes: RoadmapChange[]): SyncSummary[] {
  const map = new Map<string, SyncSummary>()
  for (const c of changes) {
    if (!map.has(c.sync_id)) {
      map.set(c.sync_id, { syncId: c.sync_id, new: 0, status_changed: 0, phase_changed: 0, cancelled: 0, total: 0 })
    }
    const s = map.get(c.sync_id)
    if (!s) continue
    const t = c.change_type
    if (t === "new") s.new++
    else if (t === "status_changed") s.status_changed++
    else if (t === "phase_changed") s.phase_changed++
    else if (t === "cancelled") s.cancelled++
    s.total++
  }
  return [...map.values()]
    .sort((a, b) => a.syncId.localeCompare(b.syncId))
    .slice(-20)
}

function formatSyncDate(syncId: string): string {
  const d = new Date(syncId)
  return isNaN(d.getTime()) ? syncId : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, sub, highlight }: {
  label: string
  value: string | number
  icon: React.ElementType
  sub?: string
  highlight?: "warning" | "danger"
}) {
  const valueClass = highlight === "danger"
    ? "text-red-600 dark:text-red-400"
    : highlight === "warning"
    ? "text-amber-600 dark:text-amber-400"
    : ""
  return (
    <div className="rounded-lg border p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-semibold ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function ActivityChart({ syncs }: { syncs: SyncSummary[] }) {
  if (syncs.length === 0) return null
  const maxTotal = Math.max(...syncs.map((s) => s.total), 1)
  const segments: Array<{ key: ChangeType; color: string }> = [
    { key: "new",            color: CHART_COLORS.new },
    { key: "status_changed", color: CHART_COLORS.status_changed },
    { key: "phase_changed",  color: CHART_COLORS.phase_changed },
    { key: "cancelled",      color: CHART_COLORS.cancelled },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Bars */}
      <div className="flex items-end gap-1 h-36">
        {syncs.map((s) => {
          const heightPct = (s.total / maxTotal) * 100
          return (
            <div key={s.syncId} className="flex-1 flex flex-col justify-end min-w-0 group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 hidden group-hover:flex flex-col gap-0.5 rounded-md border bg-popover px-2.5 py-2 shadow-md text-xs whitespace-nowrap">
                <p className="font-medium mb-0.5">{formatSyncDate(s.syncId)}</p>
                {segments.map(({ key }) => s[key] > 0 && (
                  <p key={key} className="text-muted-foreground">
                    {CHANGE_BADGE[key].label}: <span className="font-medium text-foreground">{s[key]}</span>
                  </p>
                ))}
                <p className="border-t mt-0.5 pt-0.5 font-medium">Total: {s.total}</p>
              </div>
              {/* Stacked bar */}
              <div className="flex flex-col-reverse rounded-sm overflow-hidden" style={{ height: `${heightPct}%` }}>
                {segments.map(({ key, color }) => {
                  const count = s[key]
                  if (count === 0) return null
                  return (
                    <div
                      key={key}
                      style={{ flex: count, backgroundColor: color }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {/* X-axis labels — show only first, middle, last to avoid crowding */}
      <div className="flex items-end" style={{ gap: "0.25rem" }}>
        {syncs.map((s, i) => {
          const show = i === 0 || i === syncs.length - 1 || i === Math.floor(syncs.length / 2)
          return (
            <div key={s.syncId} className="flex-1 min-w-0 text-center">
              {show && (
                <span className="text-[10px] text-muted-foreground truncate block">{formatSyncDate(s.syncId)}</span>
              )}
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {segments.map(({ key, color }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-xs text-muted-foreground">{CHANGE_BADGE[key].label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
  })

  const { data: pipelineStatus } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: getPipelineStatus,
  })

  const { data: changes, isLoading: changesLoading } = useQuery({
    queryKey: ["roadmap-changes"],
    queryFn: () => getRoadmapChanges(200),
  })

  const latestChanges = lastSyncChanges(changes ?? [])
  const syncHistory = buildSyncHistory(changes ?? [])
  const totalSyncs = new Set((changes ?? []).map((c) => c.sync_id)).size
  const highPriority = (customers ?? []).filter((c) => c.priority === "high").length
  const lastSyncNew = latestChanges.filter((c) => c.change_type === "new").length
  const lastSyncCancelled = latestChanges.filter((c) => c.change_type === "cancelled").length

  const statsReady = !customersLoading && !changesLoading

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview</p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 flex flex-col gap-8">

        {/* Stat cards */}
        {!statsReady ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="Total customers"
              value={customers?.length ?? 0}
              icon={Users}
            />
            <StatCard
              label="High-priority customers"
              value={highPriority}
              icon={Star}
              highlight={highPriority > 0 ? "warning" : undefined}
            />
            <StatCard
              label="Syncs tracked"
              value={totalSyncs}
              icon={RefreshCw}
              sub={pipelineStatus?.last_run
                ? `Last: ${new Date(pipelineStatus.last_run).toLocaleDateString()}`
                : "Never synced"}
            />
            <StatCard
              label="Changes in last sync"
              value={latestChanges.length}
              icon={RefreshCw}
            />
            <StatCard
              label="New items (last sync)"
              value={lastSyncNew}
              icon={Plus}
            />
            <StatCard
              label="Cancellations (last sync)"
              value={lastSyncCancelled}
              icon={XCircle}
              highlight={lastSyncCancelled > 0 ? "danger" : undefined}
            />
          </div>
        )}

        {/* Roadmap activity chart */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Roadmap activity per sync</h2>
          {changesLoading && (
            <Skeleton className="h-48" />
          )}
          {!changesLoading && syncHistory.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sync history yet.{" "}
              <Link href="/settings" className="text-primary hover:underline">Trigger a sync</Link>{" "}
              to start tracking.
            </p>
          )}
          {syncHistory.length > 0 && <ActivityChart syncs={syncHistory} />}
        </section>

        {/* Latest sync change list */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <TrendingDown size={14} className="text-blue-500" /> Latest sync changes
          </h2>
          {changesLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          )}
          {!changesLoading && latestChanges.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No changes recorded yet.{" "}
              <Link href="/settings" className="text-primary hover:underline">Trigger a sync</Link>{" "}
              to start tracking.
            </p>
          )}
          {latestChanges.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground -mt-1">
                {new Date(latestChanges[0]!.sync_id).toLocaleString()} — {latestChanges.length} change{latestChanges.length !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-col gap-1">
                {latestChanges.slice(0, 15).map((c) => {
                  const badge = CHANGE_BADGE[c.change_type as ChangeType] ?? { label: c.change_type, className: "" }
                  return (
                    <div key={c.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                      <span className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{c.item_title}</p>
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
              {latestChanges.length > 15 && (
                <Link href="/roadmap" className="text-xs text-primary hover:underline self-start">
                  View all {latestChanges.length} changes →
                </Link>
              )}
            </>
          )}
        </section>

      </div>
    </div>
  )
}
