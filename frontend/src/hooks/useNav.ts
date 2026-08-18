import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { Focus, NavData, User } from "../types/nav";

export function useNav() {
  return useQuery({
    queryKey: ["nav"],
    queryFn: () => apiFetch<NavData>("/nav"),
  });
}

export function useUser() {
  return useQuery({
    queryKey: ["user"],
    queryFn: () => apiFetch<User>("/user"),
  });
}

export function useFocus() {
  return useQuery({
    queryKey: ["focus"],
    queryFn: () => apiFetch<Focus>("/focus"),
  });
}
