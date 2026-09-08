import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiFetch, apiUpload } from '../lib/api'
import type { DatasetDetail, DatasetSummary, StarStatus, UploadResult } from '../types/dataset'

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

export function useDeleteDataset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (datasetId: string) => apiDelete<{ ok: boolean }>(`/datasets/${datasetId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
    },
  })
}
