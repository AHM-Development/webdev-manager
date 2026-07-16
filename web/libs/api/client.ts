import axios from "axios";

import { attachInterceptors } from "./interceptors";

/**
 * Shared axios instance for the app.
 * - baseURL points at the API (e.g. http://localhost:5001/api/v1)
 * - withCredentials so the auth cookie set by the API is sent/received
 */
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

attachInterceptors(apiClient);

/**
 * Resolve a server asset path (e.g. "/uploads/form-evidence/x.png", served
 * statically at the API origin) into an absolute URL. Strips the "/api/vN"
 * suffix from the API base to get the origin.
 */
export function assetUrl(path: string) {
  if (!path) return path;
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const origin = base.replace(/\/api\/v\d+\/?$/, "").replace(/\/$/, "");
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}
