// Mirrors backend/app/dataset_store.py's stored records and profile shape.

export interface DatasetSummary {
  id: string
  filename: string
  owner: string
  size_bytes: number
  rows: number
  column_count: number
  uploaded_at: number
}

export type ColumnKind = 'numeric' | 'categorical' | 'datetime' | 'text'

export interface DatasetColumn {
  name: string
  dtype: string
  kind: ColumnKind
  null_count: number
  unique_count: number
  // numeric
  min?: number | string | null
  max?: number | string | null
  mean?: number | null
  median?: number | null
  std?: number | null
  p25?: number | null
  p75?: number | null
  // categorical
  top_values?: { value: string | number | null; count: number }[]
}

export interface DatasetProfile {
  rows: number
  column_count: number
  columns: DatasetColumn[]
  sample_rows: Record<string, string | number | boolean | null>[]
}

export interface DatasetDetail extends DatasetSummary {
  profile: DatasetProfile
}

export interface UploadResult {
  datasets: DatasetSummary[]
  errors: { filename: string; error: string }[]
}
