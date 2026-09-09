import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiFetch, apiPost, apiUpload } from '../lib/api'
import type {
  AzureBlobListing,
  AzureContainer,
  DatasetDetail,
  DatasetSummary,
  StarInspectResult,
  StarInstallResult,
  StarPreview,
  StarResetResult,
  StarRole,
  StarStatus,
  UploadResult,
} from '../types/dataset'

/** Storage account + SAS, as the Azure routes take them. Held in component
 *  state for the life of the modal and sent per request — never persisted. */
export interface AzureCreds {
  account: string
  sas: string
}

/** A blob the user has picked, addressed within the account. */
export interface AzureBlobSel {
  container: string
  name: string
}

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: () => apiFetch<DatasetSummary[]>('/datasets'),
  })
}

// Which of the six star-schema CSVs the Data/ folder currently holds. This is
// the folder every dashboard and KPI reads, so it — not the uploads list — is
// what tells the Excel connector whether real data is wired up.
export function useStarStatus() {
  return useQuery({
    queryKey: ['datasets', 'star'],
    queryFn: () => apiFetch<StarStatus>('/datasets/star'),
  })
}

export function useDataset(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['datasets', datasetId],
    queryFn: () => apiFetch<DatasetDetail>(`/datasets/${datasetId}`),
    enabled: Boolean(datasetId),
  })
}

// Real multipart upload — the file actually lands on the backend, gets parsed
// by pandas and profiled (see backend/app/dataset_store.py). Replaces the old
// fake 1.1s setTimeout that never sent anything anywhere.
export function useUploadDatasets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      return apiUpload<UploadResult>('/datasets', form)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
      // A star install replaces the CSVs behind every KPI, chart and filter in
      // the platform, so nothing cached client-side describes the current data
      // any more. Blanket-invalidate rather than listing the dozens of query
      // keys that would each need naming here.
      if (result.star?.installed.length) queryClient.invalidateQueries()
    },
  })
}

// A page of rows from one installed star table. Enabled only when a role is
// actually selected, so opening the connector doesn't fetch six previews.
export function useStarPreview(role: StarRole | null, offset = 0) {
  return useQuery({
    queryKey: ['datasets', 'star', 'preview', role, offset],
    queryFn: () => apiFetch<StarPreview>(`/datasets/star/preview/${role}?offset=${offset}`),
    enabled: Boolean(role),
  })
}

// Clear all six files. Destructive and deliberate: it is the only route back to
// the upload prompt, since uploading over a complete set is refused.
export function useResetStar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiDelete<StarResetResult>('/datasets/star'),
    onSuccess: () => {
      // Same reasoning as a star install: every KPI, chart and filter in the
      // app was derived from the files just deleted, so nothing cached still
      // describes the current state.
      queryClient.invalidateQueries()
    },
  })
}

// ===== Azure Blob Storage =====
// All four are mutations rather than queries: each carries a SAS token in its
// body, which must not end up in a react-query cache key.

export function useAzureContainers() {
  return useMutation({
    mutationFn: (creds: AzureCreds) =>
      apiPost<{ containers: AzureContainer[]; container_scoped: boolean }>(
        '/datasets/azure/containers',
        creds,
      ),
  })
}

export function useAzureBlobs() {
  return useMutation({
    mutationFn: (req: AzureCreds & { container: string; prefix: string }) =>
      apiPost<AzureBlobListing>('/datasets/azure/blobs', req),
  })
}

// Header-only reads of the picked blobs, so the modal can name which table each
// file is before committing to downloading 21 MB.
export function useAzureInspect() {
  return useMutation({
    mutationFn: (req: AzureCreds & { blobs: AzureBlobSel[] }) =>
      apiPost<StarInspectResult>('/datasets/azure/inspect', req),
  })
}

export function useAzureInstall() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: AzureCreds & { blobs: AzureBlobSel[] }) =>
      apiPost<StarInstallResult>('/datasets/azure/install', req),
    onSuccess: () => {
      // Same blanket invalidation as an Excel install: this replaced the CSVs
      // behind every KPI, chart and filter in the platform.
      queryClient.invalidateQueries()
    },
  })
}

export function useDeleteDataset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datasetId: string) => apiDelete<{ ok: boolean }>(`/datasets/${datasetId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
    },
  })
}
