"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Users, RefreshCw, AlertTriangle, TrendingDown } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { getCustomers, getPipelineStatus, getRoadmapChanges } from "@/lib/api"
import type { Customer, RoadmapChange } from "@/types/api"
import { STATUS_STYLE } from "@/app/customers/page"
import { cn } from "@/lib/utils"

const CHANGE_BADGE: Record<string, { label: string; className: string }> = {
  new:            { label: "New",      className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  status_changed: { label: "Status",   className: "bg-blue-100  text-blue-800  dark:bg-blue-900  dark:text-blue-200"  },
  phase_changed:  { label: "Phase",    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  cancelled:      { label: "Cancelled",className: "bg-red-100   text-red-800   dark:bg-red-900   dark:text-red-200"   },
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

function StatCard({ label, value, icon: Icon, sub }: {
  label: string
  value: string | number
  icon: React.ElementType
  sub?: string
}) {
  return (
    <div className="rounded-lg border p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function lastSyncChanges(changes: RoadmapChange[]): RoadmapChange[] {
  if (!changes.length) return []
  const latest = [...changes].sort((a, b) => b.sync_id.localeCompare(a.sync_id))[0]!.sync_id
  return changes.filter((c) => c.sync_id === latest)
}

function attentionCustomers(customers: Customer[]): Customer[] {
  return customers
    .filter((c) => c.status === "at_risk" || c.status === "churning")
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99))
}

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
  const atRisk = attentionCustomers(customers ?? [])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Weekly overview</p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 flex flex-col gap-8 max-w-4xl">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          {customersLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatCard
                label="Total customers"
                value={customers?.length ?? 0}
                icon={Users}
              />
              <StatCard
                label="Needing attention"
                value={atRisk.length}
                icon={AlertTriangle}
                sub={atRisk.length === 0 ? "All customers stable" : "At risk or churning"}
              />
              <StatCard
                label="Changes in last sync"
                value={latestChanges.length}
                icon={RefreshCw}
                sub={pipelineStatus?.last_run
                  ? `Synced ${new Date(pipelineStatus.last_run).toLocaleDateString()}`
                  : "Never synced"}
              />
            </>
          )}
        </div>

        {/* Attention needed */}
        {atRisk.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-500" /> Needs attention
            </h2>
            <div className="flex flex-col gap-2">
              {atRisk.map((c) => {
                const s = c.status ? STATUS_STYLE[c.status] : null
                return (
                  <Link
                    key={c.name}
                    href={`/customers/${encodeURIComponent(c.name)}`}
                    className="rounded-lg border px-4 py-3 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground capitalize">{c.priority}</span>
                      {s && (
                        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", s.className)}>
                          {s.label}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Recent roadmap changes */}
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
              <Link href="/settings" className="text-primary hover:underline">
                Trigger a sync
              </Link>{" "}
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
                  const badge = CHANGE_BADGE[c.change_type] ?? { label: c.change_type, className: "" }
                  return (
                    <div key={c.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                      <span className={cn("shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium", badge.className)}>
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
