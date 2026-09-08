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

// One of the six star-schema tables, written into the Data/ folder the TPO
// loader reads. Mirrors backend/app/star_dataset.py.
export type StarRole = 'fact' | 'product' | 'geo_store' | 'channel' | 'promotion' | 'date'

export interface StarInstalledFile {
  role: StarRole
  filename: string
  original_name: string
  matched_by: string
  size_bytes: number
}

export interface StarInstallResult {
  installed: StarInstalledFile[]
  /** Canonical filenames that already existed and were overwritten. */
  replaced: string[]
  /** Fact rows the reloaded store holds — null when nothing was installed. */
  rows: number | null
  data_dir: string
}

export interface StarStatusFile {
  role: StarRole
  label: string
  filename: string
  /** Columns the loader reads from this table — what identifies it. */
  required_columns: string[]
  present: boolean
  size_bytes: number
  modified_at: number | null
}

export interface StarStatus {
  data_dir: string
  files: StarStatusFile[]
  complete: boolean
  /** All six present — uploading is closed until a reset clears them. */
  locked: boolean
}

/** A window of rows from one installed table, for the View panel. */
export interface StarPreview {
  role: StarRole
  label: string
  filename: string
  columns: string[]
  rows: Record<string, string>[]
  /** Total data rows in the file, not just those returned. */
  row_count: number
  offset: number
  limit: number
  size_bytes: number
  modified_at: number
}

export interface StarResetResult {
  /** Canonical filenames actually deleted. */
  removed: string[]
  data_dir: string
}

export interface UploadResult {
  datasets: DatasetSummary[]
  errors: { filename: string; error: string }[]
  /** Present when the upload included star-schema files. */
  star: StarInstallResult | null
}
