"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getDefaultReportTemplate, updateDefaultReportTemplate } from "@/lib/api"

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

      <div className="flex-1 overflow-auto px-6 py-6 max-w-2xl">
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-sm font-semibold">Default report template</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Instructions for the AI when generating reports. Customers with their own template
              override this. Leave a customer&apos;s template blank to use this default.
            </p>
          </div>

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
        </div>
      </div>
    </div>
  )
}
