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

export const generateReport = (name: string, itemIds: number[]) =>
  request<Report>(`/customers/${encodeURIComponent(name)}/reports/generate`, {
    method: "POST",
    body: JSON.stringify({ item_ids: itemIds }),
  })

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

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export async function streamQuery(
  query: string,
  history: ChatMessage[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`${res.status}: stream failed`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let updatedHistory: ChatMessage[] = history

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6).trim()
      if (data === "[DONE]") return updatedHistory
      try {
        const parsed = JSON.parse(data) as { delta?: string; history?: ChatMessage[] }
        if (parsed.delta !== undefined) onDelta(parsed.delta)
        if (parsed.history !== undefined) updatedHistory = parsed.history
      } catch {
        // skip malformed chunks
      }
    }
  }
  return updatedHistory
}
