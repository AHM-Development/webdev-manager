"use client";

import { toast } from "@heroui/react";
import type { ReactNode } from "react";

type NotifyOptions = {
  description?: ReactNode;
  timeout?: number;
};

const DEFAULT_TIMEOUT = 4500;

export const notify = {
  success(message: ReactNode, options?: NotifyOptions) {
    return toast.success(message, {
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      description: options?.description,
    });
  },
  error(message: ReactNode, options?: NotifyOptions) {
    return toast.danger(message, {
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      description: options?.description,
    });
  },
  warning(message: ReactNode, options?: NotifyOptions) {
    return toast.warning(message, {
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      description: options?.description,
    });
  },
  info(message: ReactNode, options?: NotifyOptions) {
    return toast.info(message, {
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      description: options?.description,
    });
  },
};
