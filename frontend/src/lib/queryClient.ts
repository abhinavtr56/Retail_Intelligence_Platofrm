import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // this data only changes when someone edits a JSON file by hand right now
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
