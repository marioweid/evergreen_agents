"use client"

import { use, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { ArrowLeft, Trash2, Loader2, ExternalLink, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  getCustomer, getCustomerImpact, getCustomerReports, deleteCustomer,
  generateReport, saveReport, approveReport,
} from "@/lib/api"
import type { ReportPreview } from "@/types/api"

const PRIORITY_VARIANT = { high: "destructive", medium: "secondary", low: "outline" } as const

function ImpactTab({ name, onReportGenerated }: { name: string; onReportGenerated: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["impact", name],
    queryFn: () => getCustomerImpact(name, 20),
  })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [editedContent, setEditedContent] = useState("")
  const [saving, setSaving] = useState(false)

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function generate() {
    setGenerating(true)
    try {
      const result = await generateReport(name, [...selected])
      setPreview(result)
      setEditedContent(result.content)
    } finally {
      setGenerating(false)
    }
  }

  async function save(status: "draft" | "approved") {
    if (!preview) return
    setSaving(true)
    try {
      await saveReport(name, preview.title, editedContent, status)
      setPreview(null)
      setSelected(new Set())
      onReportGenerated()
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
  if (!data?.length) return <p className="text-sm text-muted-foreground">No relevant roadmap changes found.</p>

  if (preview) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
            <ArrowLeft size={14} className="mr-1" /> Back
          </Button>
          <p className="text-sm font-medium truncate">{preview.title}</p>
        </div>
        <textarea
          className="w-full rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          rows={20}
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void save("draft")} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            Save as Draft
          </Button>
          <Button size="sm" onClick={() => void save("approved")} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            Approve & Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Select the changes that matter for this customer, then generate a plain-language report.</p>
      {data.map(({ item, similarity }) => (
        <div
          key={item.id}
          className={cn("rounded-lg border p-4 cursor-pointer transition-colors", selected.has(item.id) && "border-primary bg-primary/5")}
          onClick={() => toggle(item.id)}
        >
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 shrink-0"
            />
            <div className="flex-1">
              <p className="font-medium text-sm">{item.title}</p>
              {item.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {item.status && <Badge variant="outline">{item.status}</Badge>}
                {item.release_phase && <Badge variant="outline">{item.release_phase}</Badge>}
                {item.products.map((p) => <Badge key={p} variant="secondary">{p}</Badge>)}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold">{Math.round(similarity * 100)}%</div>
              <div className="text-xs text-muted-foreground">match</div>
            </div>
          </div>
        </div>
      ))}
      {selected.size > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between rounded-lg border bg-background p-3 shadow-md">
          <span className="text-sm text-muted-foreground">
            {selected.size} change{selected.size !== 1 ? "s" : ""} selected
          </span>
          <Button size="sm" onClick={() => void generate()} disabled={generating}>
            {generating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <FileText size={14} className="mr-2" />}
            Generate Report
          </Button>
        </div>
      )}
    </div>
  )
}

function ReportsTab({ name }: { name: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["reports", name],
    queryFn: () => getCustomerReports(name),
  })
  const [expanded, setExpanded] = useState<number | null>(null)
  const [approving, setApproving] = useState<number | null>(null)

  async function approve(id: number) {
    setApproving(id)
    try {
      await approveReport(id)
      void qc.invalidateQueries({ queryKey: ["reports", name] })
    } finally {
      setApproving(null)
    }
  }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
  if (!data?.length) return <p className="text-sm text-muted-foreground">No reports generated yet. Use the Impact tab to create one.</p>

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <div key={r.id} className="rounded-lg border">
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{r.title}</p>
                <Badge variant={r.status === "approved" ? "default" : "secondary"} className="shrink-0">
                  {r.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{new Date(r.generated_at).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              {r.status === "draft" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); void approve(r.id) }}
                  disabled={approving === r.id}
                >
                  {approving === r.id ? <Loader2 size={12} className="animate-spin" /> : "Approve"}
                </Button>
              )}
              {r.drive_file_id && <ExternalLink size={14} className="text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">{expanded === r.id ? "▲" : "▼"}</span>
            </div>
          </button>
          {expanded === r.id && (
            <div className="border-t px-4 py-3">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">{r.content}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function CustomerDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params)
  const decodedName = decodeURIComponent(name)
  const router = useRouter()
  const qc = useQueryClient()
  const [tab, setTab] = useState<"impact" | "reports">("impact")

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", decodedName],
    queryFn: () => getCustomer(decodedName),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(decodedName),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] })
      router.push("/customers")
    },
  })

  function confirmDelete() {
    if (window.confirm(`Delete customer "${decodedName}"? This cannot be undone.`)) {
      deleteMutation.mutate()
    }
  }

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-96" /></div>
  if (!customer) return <p className="p-6 text-sm text-muted-foreground">Customer not found.</p>

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/customers")}><ArrowLeft size={16} /></Button>
          <h1 className="text-lg font-semibold">{customer.name}</h1>
          <Badge variant={PRIORITY_VARIANT[customer.priority]}>{customer.priority}</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-2">{customer.description}</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {customer.products_used.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
        </div>
        {customer.notes && <p className="text-xs text-muted-foreground italic">{customer.notes}</p>}
        <div className="flex justify-end">
          <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </Button>
        </div>
      </div>

      <div className="border-b px-6">
        <div className="flex gap-4">
          {(["impact", "reports"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 text-sm border-b-2 transition-colors capitalize ${tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <Separator className="mb-4 hidden" />
        {tab === "impact" && (
          <ImpactTab
            name={decodedName}
            onReportGenerated={() => {
              setTab("reports")
              void qc.invalidateQueries({ queryKey: ["reports", decodedName] })
            }}
          />
        )}
        {tab === "reports" && <ReportsTab name={decodedName} />}
      </div>
    </div>
  )
}
