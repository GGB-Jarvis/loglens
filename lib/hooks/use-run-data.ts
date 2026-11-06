"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, type Anomaly, type RunDetail } from "@/lib/api";

export function useRunData(runId: string | null) {
  const [data, setData] = useState<RunDetail | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!runId) {
      setData(null);
      setAnomalies([]);
      return;
    }
    try {
      const detail = await apiGet<RunDetail>(`/api/runs/${runId}`);
      setData(detail);
      setError(null);
      if (detail.run.status === "done") {
        const nextAnomalies = await apiGet<Anomaly[]>(
          `/api/runs/${runId}/artifacts/anomalies.json`,
        ).catch(() => []);
        setAnomalies(nextAnomalies);
      } else {
        setAnomalies([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载运行失败");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) {
      setData(null);
      setAnomalies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
  }, [runId, refresh]);

  useEffect(() => {
    if (!runId || !data) return;
    if (data.run.status !== "queued" && data.run.status !== "running") return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [data, refresh, runId]);

  return { data, anomalies, loading, error, refresh };
}
