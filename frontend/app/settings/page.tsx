"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getDefaultReportTemplate,
  updateDefaultReportTemplate,
  getPipelineCron,
  updatePipelineCron,
  getPipelineStatus,
  triggerPipeline,
} from "@/lib/api"

function SettingSection({ title, description, children }: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b pb-8 last:border-b-0 last:pb-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  )
}

function PipelineSection() {
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [cron, setCron] = useState<string | null>(null)
  const [cronSaved, setCronSaved] = useState(false)

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: getPipelineStatus,
    refetchInterval: syncing ? 2000 : false,
  })

  const { data: cronData, isLoading: cronLoading } = useQuery({
    queryKey: ["settings", "pipeline-cron"],
    queryFn: getPipelineCron,
  })

  const currentCron = cron ?? cronData?.cron ?? ""

  const cronMutation = useMutation({
    mutationFn: (c: string) => updatePipelineCron(c),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["settings", "pipeline-cron"] })
      setCron(result.cron)
      setCronSaved(true)
      setTimeout(() => setCronSaved(false), 2000)
    },
  })

  async function sync() {
    setSyncing(true)
    setSyncError(null)
    try {
      await triggerPipeline()
      const poll = setInterval(async () => {
        const s = await getPipelineStatus()
        void qc.setQueryData(["pipeline-status"], s)
        if (!s.running) {
          clearInterval(poll)
          setSyncing(false)
          if (s.error) {
            setSyncError(s.error)
          } else {
            void qc.invalidateQueries({ queryKey: ["roadmap"] })
            void qc.invalidateQueries({ queryKey: ["roadmap-changes"] })
          }
        }
      }, 2000)
    } catch (err) {
      setSyncing(false)
      setSyncError(err instanceof Error ? err.message : "Sync failed.")
    }
  }

  return (
    <SettingSection
      title="Pipeline"
      description="Controls how and when M365 roadmap items are fetched and indexed."
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Manual sync</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {statusLoading
                ? "Checking status…"
                : status?.running
                  ? "Sync in progress…"
                  : status?.last_run
                    ? `Last synced ${new Date(status.last_run).toLocaleString()}`
                    : "Never synced"}
            </p>
            {syncError && <p className="text-xs text-destructive mt-1">{syncError}</p>}
            {status?.error && !syncError && (
              <p className="text-xs text-destructive mt-1">Last sync failed: {status.error}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "mr-2 animate-spin" : "mr-2"} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Cron schedule</label>
          <p className="text-xs text-muted-foreground -mt-1">
            Standard 5-field cron expression (minute hour day month weekday).
            Default: <code className="font-mono">0 2 * * 0</code> — Sundays at 02:00.
            Changes take effect within 1 minute without a restart.
          </p>
          {cronLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <div className="flex gap-2">
              <Input
                className="font-mono max-w-xs"
                value={currentCron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 2 * * 0"
              />
              <Button
                size="sm"
                onClick={() => cronMutation.mutate(currentCron)}
                disabled={cronMutation.isPending || !currentCron.trim()}
              >
                {cronMutation.isPending ? (
                  <Loader2 size={14} className="mr-2 animate-spin" />
                ) : cronSaved ? (
                  <Check size={14} className="mr-2 text-green-600" />
                ) : null}
                {cronSaved ? "Saved" : "Save schedule"}
              </Button>
            </div>
          )}
          {cronMutation.isError && (
            <p className="text-xs text-destructive">
              {cronMutation.error instanceof Error ? cronMutation.error.message : "Failed to save."}
            </p>
          )}
        </div>
      </div>
    </SettingSection>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["settings", "report-template"],
    queryFn: getDefaultReportTemplate,
  })

  const [template, setTemplate] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const currentTemplate = template ?? data?.template ?? ""

  const mutation = useMutation({
    mutationFn: (t: string) => updateDefaultReportTemplate(t),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["settings", "report-template"] })
      setTemplate(result.template)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Global configuration for Evergreen.</p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 max-w-2xl flex flex-col gap-8">
        <PipelineSection />

        <SettingSection
          title="Default report template"
          description="Instructions for the AI when generating reports. Customers with their own template override this. Leave a customer's template blank to use this default."
        >
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              rows={12}
              value={currentTemplate}
              onChange={(e) => setTemplate(e.target.value)}
            />
          )}

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : "Failed to save."}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => mutation.mutate(currentTemplate)}
              disabled={mutation.isPending || isLoading}
            >
              {mutation.isPending ? (
                <Loader2 size={14} className="mr-2 animate-spin" />
              ) : saved ? (
                <Check size={14} className="mr-2 text-green-600" />
              ) : null}
              {saved ? "Saved" : "Save template"}
            </Button>
          </div>
        </SettingSection>
      </div>
    </div>
  )
}
