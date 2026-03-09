"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Plus, Loader2, X, Search, ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCustomers, createCustomer } from "@/lib/api"
import type { Customer } from "@/types/api"

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

type SortKey = "name" | "priority"
type SortDir = "asc" | "desc"

function sortCustomers(customers: Customer[], key: SortKey, dir: SortDir): Customer[] {
  return [...customers].sort((a, b) => {
    let cmp = 0
    if (key === "name") {
      cmp = a.name.localeCompare(b.name)
    } else {
      cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    }
    return dir === "asc" ? cmp : -cmp
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={12} className="ml-1 opacity-30 inline" />
  return dir === "asc"
    ? <ChevronUp size={12} className="ml-1 inline" />
    : <ChevronDown size={12} className="ml-1 inline" />
}

const PRIORITY_VARIANT = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
} as const

function ProductTagInput({
  products,
  onChange,
}: {
  products: string[]
  onChange: (p: string[]) => void
}) {
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function add(value: string) {
    const trimmed = value.trim().replace(/,$/, "")
    if (trimmed && !products.includes(trimmed)) {
      onChange([...products, trimmed])
    }
    setInput("")
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      add(input)
    } else if (e.key === "Backspace" && input === "" && products.length > 0) {
      onChange(products.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Products used</label>
      <div
        className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-2 min-h-[42px] cursor-text focus-within:ring-2 focus-within:ring-ring"
        onClick={() => inputRef.current?.focus()}
      >
        {products.map((p) => (
          <span
            key={p}
            className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-sm text-secondary-foreground"
          >
            {p}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(products.filter((x) => x !== p)) }}
              className="text-muted-foreground hover:text-foreground leading-none"
              aria-label={`Remove ${p}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="flex-1 min-w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder={products.length === 0 ? "Type product name, press Enter to add…" : "Add another…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => input.trim() && add(input)}
        />
      </div>
      <p className="text-xs text-muted-foreground">Press Enter or comma to add · Backspace to remove last</p>
    </div>
  )
}

function CustomerForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium")
  const [notes, setNotes] = useState("")
  const [products, setProducts] = useState<string[]>([])

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
      name: name.trim(),
      description: description.trim(),
      products_used: products,
      priority,
      notes: notes.trim() || null,
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pt-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Name</label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoso Ltd" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Description</label>
        <Input
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short summary of who they are and what they do"
        />
      </div>
      <ProductTagInput products={products} onChange={setProducts} />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Priority</label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring"
          value={priority}
          onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Key contacts, renewal dates, important context…"
        />
      </div>
      {mutation.error && (
        <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
      )}
      <Button type="submit" disabled={mutation.isPending || !name.trim() || !description.trim()}>
        {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
        Create customer
      </Button>
    </form>
  )
}

export default function CustomersPage() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const { data: customers, isLoading, error } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = (customers ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.products_used.some((p) => p.toLowerCase().includes(q)),
  )
  const displayed = sortCustomers(filtered, sortKey, sortDir)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 gap-4">
        <div>
          <h1 className="text-lg font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {q ? `${displayed.length} of ${customers?.length ?? 0}` : `${customers?.length ?? 0} total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-52"
            />
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus size={14} /> New customer
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>New customer</SheetTitle>
              </SheetHeader>
              <CustomerForm onSuccess={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {customers && customers.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">No customers yet.</p>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={14} className="mr-1" /> Add your first customer
            </Button>
          </div>
        )}

        {customers && customers.length > 0 && (
          <>
            {displayed.length === 0 && (
              <p className="text-sm text-muted-foreground">No customers match &ldquo;{search}&rdquo;.</p>
            )}
            {displayed.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("name")}
                    >
                      Name <SortIcon active={sortKey === "name"} dir={sortDir} />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("priority")}
                    >
                      Priority <SortIcon active={sortKey === "priority"} dir={sortDir} />
                    </TableHead>
                    <TableHead>Products</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.map((c) => (
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
                          {c.products_used.map((p) => (
                            <Badge key={p} variant="outline">{p}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
