"use client"

import { use, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { ArrowLeft, Trash2, Loader2, FileText, Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  getCustomer,
  getCustomerImpact,
  getCustomerReports,
  getCustomerDocuments,
  createCustomerDocument,
  updateCustomerDocument,
  deleteCustomerDocument,
  deleteCustomer,
  generateReport,
  saveReport,
  approveReport,
} from "@/lib/api"
import type { CustomerDocument, ReportPreview } from "@/types/api"

const PRIORITY_VARIANT = { high: "destructive", medium: "secondary", low: "outline" } as const

// --- Impact Tab ---

function ImpactTab({
  name,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onReportGenerated,
}: {
  name: string
  dateFrom: string
  dateTo: string
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  onReportGenerated: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["impact", name, dateFrom, dateTo],
    queryFn: () => getCustomerImpact(name, 20, dateFrom || undefined, dateTo || undefined),
  })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [editedContent, setEditedContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
    try {
      const result = await generateReport(name, [...selected])
      setPreview(result)
      setEditedContent(result.content)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  async function save(status: "draft" | "approved") {
    if (!preview) return
    setSaving(true)
    setError(null)
    try {
      await saveReport(name, preview.title, editedContent, status)
      setPreview(null)
      setSelected(new Set())
      onReportGenerated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save report. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    )
  if (!data?.length)
    return (
      <p className="text-sm text-muted-foreground">No relevant roadmap changes found.</p>
    )

  if (preview) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setPreview(null); setError(null) }}>
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
        {error && <p className="text-xs text-destructive">{error}</p>}
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
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground flex-1">
          Select changes to include in a plain-language report.
        </p>
        <div className="flex items-center gap-1">
          <input
            type="date"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            aria-label="From date"
          />
          {dateFrom && (
            <button
              onClick={() => onDateFromChange("")}
              className="text-muted-foreground hover:text-foreground text-xs"
              aria-label="Clear from date"
            >×</button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="date"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            aria-label="To date"
          />
          {dateTo && (
            <button
              onClick={() => onDateToChange("")}
              className="text-muted-foreground hover:text-foreground text-xs"
              aria-label="Clear to date"
            >×</button>
          )}
        </div>
      </div>
      {data.map(({ item, similarity }) => (
        <div
          key={item.id}
          className={cn(
            "rounded-lg border p-4 cursor-pointer transition-colors",
            selected.has(item.id) && "border-primary bg-primary/5",
          )}
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
              {item.description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
              )}
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
      {error && <p className="text-xs text-destructive">{error}</p>}
      {selected.size > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between rounded-lg border bg-background p-3 shadow-md">
          <span className="text-sm text-muted-foreground">
            {selected.size} change{selected.size !== 1 ? "s" : ""} selected
          </span>
          <Button size="sm" onClick={() => void generate()} disabled={generating}>
            {generating
              ? <Loader2 size={14} className="mr-2 animate-spin" />
              : <FileText size={14} className="mr-2" />}
            Generate Report
          </Button>
        </div>
      )}
    </div>
  )
}

// --- Reports Tab ---

function ReportsTab({ name }: { name: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["reports", name],
    queryFn: () => getCustomerReports(name),
  })
  const [expanded, setExpanded] = useState<number | null>(null)
  const [approving, setApproving] = useState<number | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)

  async function approve(id: number) {
    setApproving(id)
    setApproveError(null)
    try {
      await approveReport(id)
      void qc.invalidateQueries({ queryKey: ["reports", name] })
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to approve report.")
    } finally {
      setApproving(null)
    }
  }

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    )
  if (!data?.length)
    return (
      <p className="text-sm text-muted-foreground">
        No reports generated yet. Use the Impact tab to create one.
      </p>
    )

  return (
    <div className="space-y-3">
      {approveError && <p className="text-xs text-destructive">{approveError}</p>}
      {data.map((r) => (
        <div key={r.id} className="rounded-lg border">
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{r.title}</p>
                <Badge
                  variant={r.status === "approved" ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {r.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(r.generated_at).toLocaleString()}
              </p>
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

// --- Documents Tab ---

interface DocFormState {
  title: string
  content: string
}

function DocumentForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: DocFormState
  onSave: (data: DocFormState) => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const [title, setTitle] = useState(initial.title)
  const [content, setContent] = useState(initial.content)

  return (
    <div className="rounded-lg border p-4 flex flex-col gap-3">
      <input
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Title (e.g. Battle Card, Meeting Notes)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Document content…"
        rows={10}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSave({ title, content })}
          disabled={saving || !title.trim() || !content.trim()}
        >
          {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  )
}

function DocumentsTab({ name }: { name: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["documents", name],
    queryFn: () => getCustomerDocuments(name),
  })
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<CustomerDocument | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(data: DocFormState) {
    setSaving(true)
    setError(null)
    try {
      await createCustomerDocument(name, { title: data.title, content: data.content })
      void qc.invalidateQueries({ queryKey: ["documents", name] })
      setCreating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save document.")
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(doc: CustomerDocument, data: DocFormState) {
    setSaving(true)
    setError(null)
    try {
      await updateCustomerDocument(name, doc.id, { title: data.title, content: data.content })
      void qc.invalidateQueries({ queryKey: ["documents", name] })
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save document.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(doc: CustomerDocument) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    setDeleting(doc.id)
    setError(null)
    try {
      await deleteCustomerDocument(name, doc.id)
      void qc.invalidateQueries({ queryKey: ["documents", name] })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document.")
    } finally {
      setDeleting(null)
    }
  }

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-xs text-destructive">{error}</p>}

      {creating && (
        <DocumentForm
          initial={{ title: "", content: "" }}
          onSave={(d) => void handleCreate(d)}
          onCancel={() => { setCreating(false); setError(null) }}
          saving={saving}
          error={null}
        />
      )}

      {!creating && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setCreating(true); setEditing(null) }}>
            <Plus size={14} className="mr-1" /> New Document
          </Button>
        </div>
      )}

      {!data?.length && !creating && (
        <p className="text-sm text-muted-foreground">
          No documents yet. Add battle cards, meeting notes, or any customer context.
        </p>
      )}

      {data?.map((doc) => (
        <div key={doc.id} className="rounded-lg border">
          {editing?.id === doc.id ? (
            <DocumentForm
              initial={{ title: doc.title, content: doc.content }}
              onSave={(d) => void handleUpdate(doc, d)}
              onCancel={() => { setEditing(null); setError(null) }}
              saving={saving}
              error={null}
            />
          ) : (
            <div className="flex items-start justify-between px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{doc.title}</p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{doc.content}</p>
                {doc.updated_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated {new Date(doc.updated_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setEditing(doc); setCreating(false); setError(null) }}
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDelete(doc)}
                  disabled={deleting === doc.id}
                >
                  {deleting === doc.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Trash2 size={14} />}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// --- Page ---

export default function CustomerDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params)
  const decodedName = decodeURIComponent(name)
  const router = useRouter()
  const qc = useQueryClient()
  const [tab, setTab] = useState<"impact" | "reports" | "documents">("impact")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

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

  if (isLoading)
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
    )
  if (!customer) return <p className="p-6 text-sm text-muted-foreground">Customer not found.</p>

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/customers")}>
            <ArrowLeft size={16} />
          </Button>
          <h1 className="text-lg font-semibold">{customer.name}</h1>
          <Badge variant={PRIORITY_VARIANT[customer.priority]}>{customer.priority}</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-2">{customer.description}</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {customer.products_used.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
        </div>
        {customer.notes && (
          <p className="text-xs text-muted-foreground italic">{customer.notes}</p>
        )}
        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={confirmDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </Button>
        </div>
      </div>

      <div className="border-b px-6">
        <div className="flex gap-4">
          {(["impact", "reports", "documents"] as const).map((t) => (
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
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onReportGenerated={() => {
              setTab("reports")
              void qc.invalidateQueries({ queryKey: ["reports", decodedName] })
            }}
          />
        )}
        {tab === "reports" && <ReportsTab name={decodedName} />}
        {tab === "documents" && <DocumentsTab name={decodedName} />}
      </div>
    </div>
  )
}
