import type {
  Customer,
  CustomerCreate,
  CustomerDocument,
  CustomerDocumentCreate,
  CustomerDocumentUpdate,
  CustomerUpdate,
  Report,
  ReportPreview,
  RoadmapChange,
  RoadmapFilters,
  RoadmapItem,
  RoadmapPage,
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

export const getCustomerImpact = (
  name: string,
  limit = 10,
  dateFrom?: string,
  dateTo?: string,
) => {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (dateFrom) qs.set("release_date_from", dateFrom)
  if (dateTo) qs.set("release_date_to", dateTo)
  return request<RoadmapSearchResult[]>(
    `/customers/${encodeURIComponent(name)}/impact?${qs.toString()}`,
  )
}

// --- Customer documents ---

export const getCustomerDocuments = (name: string) =>
  request<CustomerDocument[]>(`/customers/${encodeURIComponent(name)}/documents`)

export const createCustomerDocument = (name: string, data: CustomerDocumentCreate) =>
  request<CustomerDocument>(`/customers/${encodeURIComponent(name)}/documents`, {
    method: "POST",
    body: JSON.stringify(data),
  })

export const updateCustomerDocument = (
  name: string,
  docId: number,
  data: CustomerDocumentUpdate,
) =>
  request<CustomerDocument>(`/customers/${encodeURIComponent(name)}/documents/${docId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })

export const deleteCustomerDocument = (name: string, docId: number) =>
  fetch(`${BASE}/customers/${encodeURIComponent(name)}/documents/${docId}`, { method: "DELETE" })

// --- Reports ---

export const getCustomerReports = (name: string) =>
  request<Report[]>(`/customers/${encodeURIComponent(name)}/reports`)

export const generateReport = (name: string, itemIds: number[]) =>
  request<ReportPreview>(`/customers/${encodeURIComponent(name)}/reports/generate`, {
    method: "POST",
    body: JSON.stringify({ item_ids: itemIds }),
  })

export const saveReport = (
  name: string,
  title: string,
  content: string,
  status: "draft" | "approved",
) =>
  request<Report>(`/customers/${encodeURIComponent(name)}/reports`, {
    method: "POST",
    body: JSON.stringify({ title, content, status }),
  })

export const approveReport = (reportId: number) =>
  request<Report>(`/reports/${reportId}/approve`, { method: "PATCH" })

export const updateReport = (reportId: number, title: string, content: string) =>
  request<Report>(`/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, content }),
  })

export const deleteReport = (reportId: number) =>
  fetch(`${BASE}/reports/${reportId}`, { method: "DELETE" })

// --- Pipeline ---

export interface PipelineStatus {
  running: boolean
  last_run: string | null
  error: string | null
}

export const getPipelineStatus = () => request<PipelineStatus>("/pipeline/status")

export const triggerPipeline = () =>
  request<{ status: string }>("/pipeline/trigger", { method: "POST" })

// --- Roadmap ---

export interface RoadmapQuery {
  q?: string
  product?: string
  status?: string
  release_phase?: string
  release_date_from?: string
  release_date_to?: string
  limit?: number
  offset?: number
}

export const getRoadmap = (params: RoadmapQuery = {}) => {
  const qs = new URLSearchParams()
  if (params.q) qs.set("q", params.q)
  if (params.product) qs.set("product", params.product)
  if (params.status) qs.set("status", params.status)
  if (params.release_phase) qs.set("release_phase", params.release_phase)
  if (params.release_date_from) qs.set("release_date_from", params.release_date_from)
  if (params.release_date_to) qs.set("release_date_to", params.release_date_to)
  if (params.limit) qs.set("limit", String(params.limit))
  if (params.offset) qs.set("offset", String(params.offset))
  return request<RoadmapPage>(`/roadmap?${qs.toString()}`)
}

export const getRoadmapFilters = () => request<RoadmapFilters>("/roadmap/filters")

export const getRoadmapChanges = (limit = 100, since?: string) => {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (since) qs.set("since", since)
  return request<RoadmapChange[]>(`/roadmap/changes?${qs.toString()}`)
}

export const getRoadmapItem = (id: number) => request<RoadmapItem>(`/roadmap/${id}`)

// --- Settings ---

export const getDefaultReportTemplate = () =>
  request<{ template: string }>("/settings/report-template")

export const updateDefaultReportTemplate = (template: string) =>
  request<{ template: string }>("/settings/report-template", {
    method: "PUT",
    body: JSON.stringify({ template }),
  })

export const getPipelineCron = () =>
  request<{ cron: string }>("/settings/pipeline-cron")

export const updatePipelineCron = (cron: string) =>
  request<{ cron: string }>("/settings/pipeline-cron", {
    method: "PUT",
    body: JSON.stringify({ cron }),
  })

// --- Streaming chat ---

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export type StreamResult = { history: ChatMessage[]; reportSaved: boolean }

export async function streamQuery(
  query: string,
  history: ChatMessage[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
  customerName?: string,
): Promise<StreamResult> {
  const res = await fetch(`${BASE}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history, customer_name: customerName ?? null }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`${res.status}: stream failed`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let updatedHistory: ChatMessage[] = history
  let reportSaved = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6).trim()
      if (data === "[DONE]") return { history: updatedHistory, reportSaved }
      try {
        const parsed = JSON.parse(data) as { delta?: string; history?: ChatMessage[]; report_saved?: boolean }
        if (parsed.delta !== undefined) onDelta(parsed.delta)
        if (parsed.history !== undefined) updatedHistory = parsed.history
        if (parsed.report_saved === true) reportSaved = true
      } catch {
        // skip malformed chunks
      }
    }
  }
  return { history: updatedHistory, reportSaved }
}
