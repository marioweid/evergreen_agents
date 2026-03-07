"use client"

import { use, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { ArrowLeft, Trash2, Loader2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { getCustomer, getCustomerImpact, getCustomerReports, deleteCustomer } from "@/lib/api"

const PRIORITY_VARIANT = { high: "destructive", medium: "secondary", low: "outline" } as const

function ImpactTab({ name }: { name: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["impact", name],
    queryFn: () => getCustomerImpact(name, 15),
  })

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
  if (!data?.length) return <p className="text-sm text-muted-foreground">No relevant roadmap changes found.</p>

  return (
    <div className="space-y-3">
      {data.map(({ item, similarity }) => (
        <div key={item.id} className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
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
    </div>
  )
}

function ReportsTab({ name }: { name: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", name],
    queryFn: () => getCustomerReports(name),
  })
  const [expanded, setExpanded] = useState<number | null>(null)

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
  if (!data?.length) return <p className="text-sm text-muted-foreground">No reports generated yet. Ask the chat to generate one.</p>

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <div key={r.id} className="rounded-lg border">
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            <div>
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">{new Date(r.generated_at).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              {r.drive_file_id && <ExternalLink size={14} className="text-muted-foreground" />}
              <span className="text-xs text-muted-foreground">{expanded === r.id ? "▲" : "▼"}</span>
            </div>
          </button>
          {expanded === r.id && (
            <div className="border-t px-4 py-3">
              <pre className="whitespace-pre-wrap text-xs leading-relaxed">{r.content}</pre>
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
        {tab === "impact" && <ImpactTab name={decodedName} />}
        {tab === "reports" && <ReportsTab name={decodedName} />}
      </div>
    </div>
  )
}
