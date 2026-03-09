"use client"

import { use, useState, useRef, useEffect, type KeyboardEvent } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { ArrowLeft, Trash2, Loader2, FileText, Plus, Pencil, X, Check, Copy, CopyCheck, Send } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
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
  updateReport,
  deleteReport,
  updateCustomer,
  streamQuery,
  type ChatMessage,
} from "@/lib/api"
import type { Customer, CustomerContact, CustomerDocument, ReportPreview } from "@/types/api"

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded bg-muted p-2 text-xs font-mono">{children}</pre>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

const PRIORITY_VARIANT = { high: "destructive", medium: "secondary", low: "outline" } as const
const PRIORITIES = ["low", "medium", "high"] as const

// --- Customer edit form ---

function CustomerEditForm({
  customer,
  onSave,
  onCancel,
}: {
  customer: Customer
  onSave: (data: Partial<Customer>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(customer.name)
  const [description, setDescription] = useState(customer.description)
  const [priority, setPriority] = useState(customer.priority)
  const [notes, setNotes] = useState(customer.notes ?? "")
  const [reportTemplate, setReportTemplate] = useState(customer.report_template ?? "")
  const [products, setProducts] = useState<string[]>(customer.products_used)
  const [productInput, setProductInput] = useState("")
  const productInputRef = useRef<HTMLInputElement>(null)
  const [contacts, setContacts] = useState<CustomerContact[]>(customer.contacts ?? [])

  function addContact() {
    setContacts((prev) => [...prev, { name: "", email: "", role: null }])
  }

  function updateContact(i: number, field: keyof CustomerContact, value: string) {
    setContacts((prev) => prev.map((c, idx) =>
      idx === i ? { ...c, [field]: value || (field === "role" ? null : value) } : c
    ))
  }

  function removeContact(i: number) {
    setContacts((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addProduct(value: string) {
    const trimmed = value.trim().replace(/,$/, "")
    if (trimmed && !products.includes(trimmed)) {
      setProducts((p) => [...p, trimmed])
    }
    setProductInput("")
  }

  function handleProductKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addProduct(productInput)
    } else if (e.key === "Backspace" && productInput === "" && products.length > 0) {
      setProducts((p) => p.slice(0, -1))
    }
  }

  function removeProduct(product: string) {
    setProducts((p) => p.filter((x) => x !== product))
  }

  function handleSave() {
    onSave({
      name: name.trim(),
      description: description.trim(),
      priority,
      notes: notes.trim() || null,
      report_template: reportTemplate.trim() || null,
      products_used: productInput.trim() ? [...products, productInput.trim()] : products,
      contacts: contacts.filter((c) => c.name.trim() && c.email.trim()),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Name
          </label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Priority
          </label>
          <select
            className="h-[42px] rounded-md border border-input bg-background px-3 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Description
        </label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Products used
        </label>
        <div
          className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-2 min-h-[42px] cursor-text focus-within:ring-2 focus-within:ring-ring"
          onClick={() => productInputRef.current?.focus()}
        >
          {products.map((p) => (
            <span
              key={p}
              className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-sm text-secondary-foreground"
            >
              {p}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeProduct(p) }}
                className="text-muted-foreground hover:text-foreground leading-none"
                aria-label={`Remove ${p}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            ref={productInputRef}
            className="flex-1 min-w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={products.length === 0 ? "Type product name, press Enter to add…" : "Add another…"}
            value={productInput}
            onChange={(e) => setProductInput(e.target.value)}
            onKeyDown={handleProductKeyDown}
            onBlur={() => productInput.trim() && addProduct(productInput)}
          />
        </div>
        <p className="text-xs text-muted-foreground">Press Enter or comma to add · Backspace to remove last</p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Notes <span className="normal-case font-normal">(optional)</span>
        </label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          rows={2}
          placeholder="Internal notes, key contacts, renewal dates…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Contacts
          </label>
          <button
            type="button"
            onClick={addContact}
            className="text-xs text-primary hover:underline"
          >
            + Add contact
          </button>
        </div>
        {contacts.length === 0 && (
          <p className="text-xs text-muted-foreground">No contacts yet.</p>
        )}
        {contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
            <input
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Name"
              value={c.name}
              onChange={(e) => updateContact(i, "name", e.target.value)}
            />
            <input
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Email"
              type="email"
              value={c.email}
              onChange={(e) => updateContact(i, "email", e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeContact(i)}
              className="mt-1.5 text-muted-foreground hover:text-destructive"
              aria-label="Remove contact"
            >
              <X size={14} />
            </button>
            <input
              className="col-span-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Role (optional, e.g. IT Manager)"
              value={c.role ?? ""}
              onChange={(e) => updateContact(i, "role", e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Report template{" "}
          <span className="normal-case font-normal">(optional — overrides default)</span>
        </label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          rows={5}
          placeholder="Leave blank to use the default template…"
          value={reportTemplate}
          onChange={(e) => setReportTemplate(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Describes format and tone for AI-generated reports for this customer.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!name.trim() || !description.trim()}>
          <Check size={14} className="mr-1" /> Save changes
        </Button>
      </div>
    </div>
  )
}

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
  const [limit, setLimit] = useState(20)
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["impact", name, dateFrom, dateTo, limit],
    queryFn: () => getCustomerImpact(name, limit, dateFrom || undefined, dateTo || undefined),
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
    return <p className="text-sm text-muted-foreground">No relevant roadmap changes found.</p>

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
        <div className="flex items-center gap-2 flex-1">
          <p className="text-xs text-muted-foreground">
            Select changes to include in a plain-language report.
          </p>
          {data && data.length > 0 && (
            <div className="flex gap-2">
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => setSelected(new Set(data.map((r) => r.item.id)))}
              >
                Select all
              </button>
              {selected.size > 0 && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  Deselect all
                </button>
              )}
            </div>
          )}
        </div>
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
      {data.length === limit && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setLimit((l) => l + 20)}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
          Load more
        </Button>
      )}
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
  const [editing, setEditing] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState("")
  const [approving, setApproving] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function copy(id: number, content: string) {
    await navigator.clipboard.writeText(content)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function startEdit(r: { id: number; title: string; content: string }) {
    setEditing(r.id)
    setEditTitle(r.title)
    setEditContent(r.content)
    setExpanded(r.id)
    setActionError(null)
  }

  function cancelEdit() {
    setEditing(null)
    setActionError(null)
  }

  async function saveEdit(id: number) {
    setSaving(true)
    setActionError(null)
    try {
      await updateReport(id, editTitle, editContent)
      void qc.invalidateQueries({ queryKey: ["reports", name] })
      setEditing(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save report.")
    } finally {
      setSaving(false)
    }
  }

  async function approve(id: number) {
    setApproving(id)
    setActionError(null)
    try {
      await approveReport(id)
      void qc.invalidateQueries({ queryKey: ["reports", name] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve report.")
    } finally {
      setApproving(null)
    }
  }

  async function remove(id: number, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    setActionError(null)
    try {
      await deleteReport(id)
      void qc.invalidateQueries({ queryKey: ["reports", name] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete report.")
    } finally {
      setDeleting(null)
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
      {actionError && <p className="text-xs text-destructive">{actionError}</p>}
      {data.map((r) => (
        <div key={r.id} className="rounded-lg border">
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => {
              if (editing === r.id) return
              setExpanded(expanded === r.id ? null : r.id)
            }}
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
              <Button
                size="icon"
                variant="ghost"
                title="Copy to clipboard"
                onClick={(e) => { e.stopPropagation(); void copy(r.id, r.content) }}
              >
                {copied === r.id ? <CopyCheck size={14} className="text-green-600" /> : <Copy size={14} />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); startEdit(r) }}
              >
                <Pencil size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); void remove(r.id, r.title) }}
                disabled={deleting === r.id}
              >
                {deleting === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </Button>
              <span className="text-xs text-muted-foreground">{expanded === r.id ? "▲" : "▼"}</span>
            </div>
          </button>
          {expanded === r.id && (
            <div className="border-t px-4 py-3">
              {editing === r.id ? (
                <div className="flex flex-col gap-3">
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    rows={16}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void saveEdit(r.id)} disabled={saving}>
                      {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm leading-relaxed">
                  <MarkdownContent content={r.content} />
                </div>
              )}
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
}: {
  initial: DocFormState
  onSave: (data: DocFormState) => void
  onCancel: () => void
  saving: boolean
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

// --- Chat Tab ---

function CustomerChatTab({ customerName }: { customerName: string }) {
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [pendingChunks, setPendingChunks] = useState("")
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history, pendingChunks])

  async function send() {
    const q = input.trim()
    if (!q || streaming) return
    setInput("")
    setStreaming(true)
    setPendingChunks("")
    abortRef.current = new AbortController()
    try {
      const updated = await streamQuery(
        q,
        history,
        (delta) => setPendingChunks((prev) => prev + delta),
        abortRef.current.signal,
        customerName,
      )
      setHistory(updated)
      setPendingChunks("")
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setHistory((h) => [
          ...h,
          { role: "user" as const, content: q },
          { role: "assistant" as const, content: "Something went wrong. Please try again." },
        ])
      }
      setPendingChunks("")
    } finally {
      setStreaming(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 space-y-4 pb-4">
        {history.length === 0 && !streaming && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Ask anything about {customerName} and their M365 roadmap.
          </p>
        )}
        {history.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-4 py-2 text-sm",
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <MarkdownContent content={msg.content} />
              )}
            </div>
          </div>
        ))}
        {streaming && pendingChunks && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-4 py-2 text-sm bg-muted">
              <MarkdownContent content={pendingChunks} />
            </div>
          </div>
        )}
        {streaming && !pendingChunks && (
          <div className="flex justify-start">
            <div className="rounded-lg px-4 py-2 bg-muted">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="sticky bottom-0 bg-background border-t -mx-6 px-4 py-3 flex gap-2">
        <textarea
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={`Ask about ${customerName}…`}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
        />
        <Button size="icon" onClick={() => void send()} disabled={!input.trim() || streaming}>
          {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </Button>
      </div>
    </div>
  )
}

// --- Page ---

export default function CustomerDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params)
  const decodedName = decodeURIComponent(name)
  const router = useRouter()
  const qc = useQueryClient()
  const [tab, setTab] = useState<"impact" | "reports" | "documents" | "chat">("impact")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", decodedName],
    queryFn: () => getCustomer(decodedName),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) =>
      updateCustomer(decodedName, {
        name: data.name ?? undefined,
        description: data.description ?? undefined,
        products_used: data.products_used ?? undefined,
        priority: data.priority ?? undefined,
        notes: data.notes ?? undefined,
        report_template: data.report_template ?? undefined,
        contacts: data.contacts ?? undefined,
      }),
    onSuccess: (updated) => {
      setIsEditing(false)
      setSaveError(null)
      void qc.invalidateQueries({ queryKey: ["customers"] })
      // If name changed, redirect to the new URL
      if (updated.name !== decodedName) {
        router.replace(`/customers/${encodeURIComponent(updated.name)}`)
      } else {
        void qc.invalidateQueries({ queryKey: ["customer", decodedName] })
      }
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.")
    },
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
        <div className="flex items-start gap-2 mb-1">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 mt-0.5"
            onClick={() => router.push("/customers")}
          >
            <ArrowLeft size={16} />
          </Button>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <>
                <CustomerEditForm
                  customer={customer}
                  onSave={(data) => updateMutation.mutate(data)}
                  onCancel={() => { setIsEditing(false); setSaveError(null) }}
                />
                {saveError && <p className="mt-2 text-xs text-destructive">{saveError}</p>}
                {updateMutation.isPending && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 size={12} className="animate-spin" /> Saving…
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-semibold">{customer.name}</h1>
                  <Badge variant={PRIORITY_VARIANT[customer.priority]}>{customer.priority}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{customer.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {customer.products_used.map((p) => (
                    <Badge key={p} variant="outline">{p}</Badge>
                  ))}
                </div>
                {customer.notes && (
                  <p className="mt-2 text-xs text-muted-foreground italic">{customer.notes}</p>
                )}
                {customer.contacts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {customer.contacts.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.name}</span>
                        {c.role && <span className="text-muted-foreground">({c.role})</span>}
                        <a
                          href={`mailto:${c.email}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.email}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil size={14} className="mr-1" /> Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={confirmDelete}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Trash2 size={14} />}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="border-b px-6">
        <div className="flex gap-4">
          {(["impact", "reports", "documents", "chat"] as const).map((t) => (
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
        {tab === "chat" && <CustomerChatTab customerName={decodedName} />}
      </div>
    </div>
  )
}
