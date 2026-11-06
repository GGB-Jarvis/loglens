"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGet, type AppConfig, type RunMeta } from "@/lib/api";

type RunContextValue = {
  runs: RunMeta[];
  selectedRunId: string | null;
  selectedRun: RunMeta | null;
  config: AppConfig | null;
  loading: boolean;
  refreshRuns: () => Promise<void>;
  selectRun: (runId: string) => void;
};

const RunContext = createContext<RunContextValue | null>(null);
const STORAGE_KEY = "loglens.selectedRun";

export function RunProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshRuns = useCallback(async () => {
    try {
      const [nextRuns, nextConfig] = await Promise.all([
        apiGet<RunMeta[]>("/api/runs"),
        apiGet<AppConfig>("/api/config").catch(() => null),
      ]);
      setRuns(nextRuns);
      if (nextConfig) setConfig(nextConfig);
      setSelectedRunId((current) => {
        if (current && nextRuns.some((item) => item.id === current)) return current;
        if (typeof window !== "undefined") {
          const stored = window.localStorage.getItem(STORAGE_KEY);
          if (stored && nextRuns.some((item) => item.id === stored)) return stored;
        }
        return nextRuns[0]?.id ?? null;
      });
    } catch {
      // The page still renders with an empty state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  const active = runs.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void refreshRuns();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [active, refreshRuns]);

  const selectRun = useCallback((runId: string) => {
    setSelectedRunId(runId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, runId);
    }
  }, []);

  const value = useMemo<RunContextValue>(() => {
    const selectedRun = runs.find((item) => item.id === selectedRunId) ?? null;
    return {
      runs,
      selectedRunId,
      selectedRun,
      config,
      loading,
      refreshRuns,
      selectRun,
    };
  }, [runs, selectedRunId, config, loading, refreshRuns, selectRun]);

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRunContext(): RunContextValue {
  const value = useContext(RunContext);
  if (!value) throw new Error("useRunContext must be used inside RunProvider");
  return value;
}
