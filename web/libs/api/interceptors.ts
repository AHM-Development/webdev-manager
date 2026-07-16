import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { clearAuthTokens, getAccessToken, setAccessToken } from "./token-store";

/** Normalized error shape the app can rely on, regardless of failure mode. */
export type ApiError = {
  message: string;
  status?: number;
};

/**
 * Attaches a response interceptor that converts any axios failure into a
 * predictable { message, status } object, so callers don't have to dig
 * through error.response?.data?.message everywhere.
 */
export function attachInterceptors(client: AxiosInstance) {
  client.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  let refreshRequest: Promise<string> | null = null;

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<{ message?: string; error?: { message?: string } }>) => {
      const request = error.config as
        | (InternalAxiosRequestConfig & { _authRetry?: boolean })
        | undefined;
      const url = request?.url ?? "";
      const isAuthEndpoint = [
        "/auth/login",
        "/auth/refresh",
        "/auth/reset-password",
      ].some((path) => url.includes(path));

      if (error.response?.status === 401 && request && !request._authRetry && !isAuthEndpoint) {
        request._authRetry = true;
        try {
          if (!refreshRequest) {
            refreshRequest = client
              .post<{ accessToken: string }>("/auth/refresh")
              .then((response) => {
                setAccessToken(response.data.accessToken);
                return response.data.accessToken;
              })
              .finally(() => {
                refreshRequest = null;
              });
          }
          const token = await refreshRequest;
          request.headers.Authorization = `Bearer ${token}`;
          return client(request);
        } catch {
          clearAuthTokens();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("ahm:auth-expired"));
          }
        }
      }

      const isTimeout =
        error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";

      const apiError: ApiError = {
        message:
          error.response?.data?.message ??
          error.response?.data?.error?.message ??
          (isTimeout
            ? "The request timed out. Please try again."
            : error.message ?? "Something went wrong. Please try again."),
        status: error.response?.status,
      };
      return Promise.reject(apiError);
    }
  );
}
