import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiFetch, apiUpload } from '../lib/api'
import type { DatasetDetail, DatasetSummary, UploadResult } from '../types/dataset'

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: () => apiFetch<DatasetSummary[]>('/datasets'),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] })
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
