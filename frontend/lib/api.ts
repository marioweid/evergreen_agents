import type {
  Customer,
  CustomerCreate,
  CustomerUpdate,
  Report,
  RoadmapFilters,
  RoadmapItem,
  RoadmapSearchResult,
} from "@/types/api"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// --- Customers ---

export const getCustomers = () => request<Customer[]>("/customers")

export const getCustomer = (name: string) =>
  request<Customer>(`/customers/${encodeURIComponent(name)}`)

export const createCustomer = (data: CustomerCreate) =>
  request<Customer>("/customers", { method: "POST", body: JSON.stringify(data) })

export const updateCustomer = (name: string, data: CustomerUpdate) =>
  request<Customer>(`/customers/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })

export const deleteCustomer = (name: string) =>
  fetch(`${BASE}/customers/${encodeURIComponent(name)}`, { method: "DELETE" })

export const getCustomerImpact = (name: string, limit = 10) =>
  request<RoadmapSearchResult[]>(
    `/customers/${encodeURIComponent(name)}/impact?limit=${limit}`,
  )

export const getCustomerReports = (name: string) =>
  request<Report[]>(`/customers/${encodeURIComponent(name)}/reports`)

// --- Roadmap ---

export interface RoadmapQuery {
  q?: string
  product?: string
  status?: string
  release_phase?: string
  limit?: number
}

export const getRoadmap = (params: RoadmapQuery = {}) => {
  const qs = new URLSearchParams()
  if (params.q) qs.set("q", params.q)
  if (params.product) qs.set("product", params.product)
  if (params.status) qs.set("status", params.status)
  if (params.release_phase) qs.set("release_phase", params.release_phase)
  if (params.limit) qs.set("limit", String(params.limit))
  return request<RoadmapItem[]>(`/roadmap?${qs.toString()}`)
}

export const getRoadmapFilters = () => request<RoadmapFilters>("/roadmap/filters")

export const getRoadmapItem = (id: number) => request<RoadmapItem>(`/roadmap/${id}`)

// --- Streaming chat ---

export async function streamQuery(
  query: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`${res.status}: stream failed`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6).trim()
      if (data === "[DONE]") return
      try {
        const parsed = JSON.parse(data) as { delta: string }
        onDelta(parsed.delta)
      } catch {
        // skip malformed chunks
      }
    }
  }
}
