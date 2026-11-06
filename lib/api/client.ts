async function errorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const errors = Array.isArray(detail.errors) ? detail.errors : [];
      return [detail.message || "请求失败", ...errors].filter(Boolean).join("；");
    }
    if (Array.isArray(detail)) return detail.map((item) => item?.msg || "参数错误").join("；");
  } catch {
    // ignore non-JSON errors
  }
  return response.statusText || "请求失败";
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<T>;
}

export async function apiText(path: string): Promise<string> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.text();
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<T>;
}

export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(path, { method: "POST", body: form, cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<T>;
}

export function runArtifact(runId: string, name: string): string {
  return `/api/runs/${runId}/artifacts/${name}`;
}
