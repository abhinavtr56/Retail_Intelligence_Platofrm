import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { CommandData } from "../types/command";

export function useCommand() {
  return useQuery({
    queryKey: ["command"],
    queryFn: () => apiFetch<CommandData>("/command"),
  });
}
