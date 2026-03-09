export interface Customer {
  id: number | null
  name: string
  description: string
  products_used: string[]
  priority: "low" | "medium" | "high"
  notes: string | null
  report_template: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CustomerCreate {
  name: string
  description: string
  products_used: string[]
  priority: "low" | "medium" | "high"
  notes?: string | null
}

export interface CustomerUpdate {
  name?: string | null
  description?: string | null
  products_used?: string[] | null
  priority?: "low" | "medium" | "high" | null
  notes?: string | null
  report_template?: string | null
}

export interface CustomerDocument {
  id: number
  customer_id: number
  title: string
  content: string
  created_at: string | null
  updated_at: string | null
}

export interface CustomerDocumentCreate {
  title: string
  content: string
}

export interface CustomerDocumentUpdate {
  title?: string | null
  content?: string | null
}

export interface RoadmapItem {
  id: number
  title: string
  description: string | null
  status: string | null
  release_date: string | null
  products: string[]
  platforms: string[]
  cloud_instances: string[]
  release_phase: string | null
  created_at: string | null
  updated_at: string | null
}

export interface RoadmapSearchResult {
  item: RoadmapItem
  similarity: number
}

export interface RoadmapFilters {
  products: string[]
  statuses: string[]
  release_phases: string[]
}

export interface RoadmapPage {
  items: RoadmapItem[]
  has_more: boolean
}

export interface RoadmapChange {
  id: number
  item_id: number
  item_title: string
  change_type: "new" | "status_changed" | "phase_changed" | "cancelled"
  old_value: string | null
  new_value: string | null
  sync_id: string
  detected_at: string
}

export interface ReportPreview {
  title: string
  content: string
}

export interface Report {
  id: number
  customer_id: number
  title: string
  content: string
  status: "draft" | "approved"
  generated_at: string
}
