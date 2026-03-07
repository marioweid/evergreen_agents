export interface Customer {
  id: number | null
  name: string
  description: string
  products_used: string[]
  priority: "low" | "medium" | "high"
  notes: string | null
  drive_folder_id: string | null
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
  description?: string | null
  products_used?: string[] | null
  priority?: "low" | "medium" | "high" | null
  notes?: string | null
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

export interface Report {
  id: number
  customer_id: number
  title: string
  content: string
  drive_file_id: string | null
  generated_at: string
}
