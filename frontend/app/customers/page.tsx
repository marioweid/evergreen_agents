"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCustomers, createCustomer } from "@/lib/api"
import type { CustomerCreate } from "@/types/api"

const PRIORITY_VARIANT = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
} as const

function CustomerForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CustomerCreate>({
    name: "",
    description: "",
    products_used: [],
    priority: "medium",
    notes: null,
  })
  const [productsRaw, setProductsRaw] = useState("")

  const mutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] })
      onSuccess()
    },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      ...form,
      products_used: productsRaw.split(",").map((p) => p.trim()).filter(Boolean),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pt-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Name</label>
        <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Description</label>
        <Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Products used (comma-separated)</label>
        <Input value={productsRaw} onChange={(e) => setProductsRaw(e.target.value)} placeholder="Teams, SharePoint, Exchange" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Priority</label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value as "low" | "medium" | "high" })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Notes</label>
        <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
      </div>
      {mutation.error && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
        Create customer
      </Button>
    </form>
  )
}

export default function CustomersPage() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { data: customers, isLoading, error } = useQuery({ queryKey: ["customers"], queryFn: getCustomers })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers?.length ?? 0} total</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={14} /> New customer
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>New customer</SheetTitle></SheetHeader>
            <CustomerForm onSuccess={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {customers && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Products</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow
                  key={c.name}
                  className="cursor-pointer"
                  onClick={() => router.push(`/customers/${encodeURIComponent(c.name)}`)}
                >
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={PRIORITY_VARIANT[c.priority]}>{c.priority}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.products_used.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
