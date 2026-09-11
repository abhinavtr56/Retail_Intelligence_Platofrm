import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/** The dataset status `RequireDataset` gates the whole app on. */
const STAR_STATUS_KEY = ["datasets", "star"] as const;

/** Did this failure mean "there is no dataset loaded"? */
const isDatasetMissing = (error: unknown) =>
  error instanceof ApiError && error.datasetMissing;

/** A failed query anywhere re-checks whether the dataset still exists.
 *
 *  WHY THIS IS THE FIX RATHER THAN A NICER ERROR MESSAGE. `RequireDataset`
 *  already renders the right screen for "no dataset" — the six-table checklist
 *  with an upload button — but it only evaluates when its own status query
 *  resolves. A dataset removed WHILE a page is open (a connector Reset in
 *  another tab, which is exactly how this happens) left that status cached as
 *  `complete: true`, so the gate kept the page mounted and every panel on it
 *  failed separately with a generic "Unable to load data — Retry".
 *
 *  Invalidating the status here means the first panel to notice re-checks, the
 *  gate flips, and the user lands on the upload screen instead of a page of
 *  broken cards. The app heals itself into a screen that already exists rather
 *  than growing a second way to say the same thing.
 *
 *  No loop: `/api/datasets/star` reports which of the six files are present and
 *  answers 200 with an empty folder, so it never raises the error that triggers
 *  this.
 */
const queryCache = new QueryCache({
  onError: (error) => {
    if (isDatasetMissing(error)) {
      void queryClient.invalidateQueries({ queryKey: STAR_STATUS_KEY });
    }
  },
});

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      staleTime: 30_000, // this data only changes when someone edits a JSON file by hand right now
      // A missing dataset is not a transient failure — retrying cannot make the
      // files appear, and every retry delays the gate flipping. Everything else
      // keeps the single retry it had.
      retry: (failureCount, error) => !isDatasetMissing(error) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
});
