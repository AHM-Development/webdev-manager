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
