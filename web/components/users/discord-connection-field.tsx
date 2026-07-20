"use client";

import { Button, Input } from "@heroui/react";
import { CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { testDiscordUser } from "@/libs/api/users";

type DiscordStatus = "idle" | "checking" | "connected" | "invalid";

const statusContent: Partial<
  Record<DiscordStatus, { label: string; className: string; icon: "check" | "x" }>
> = {
  connected: {
    label: "Connected",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: "check",
  },
  invalid: {
    label: "Invalid",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    icon: "x",
  },
};

export function DiscordConnectionField({
  label = "Discord ID (optional)",
  defaultValue = "",
  value: controlledValue,
  onChange,
  error,
  className = "",
}: {
  label?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  className?: string;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [status, setStatus] = useState<DiscordStatus>("idle");
  const value = controlledValue !== undefined ? controlledValue : uncontrolledValue;

  const testConnection = async () => {
    setStatus("checking");
    try {
      const result = await testDiscordUser(value);
      setStatus(result.connected ? "connected" : "invalid");
    } catch {
      setStatus("invalid");
    }
  };

  const statusMeta = statusContent[status];

  return (
    <div className={className}>
      <div className="mb-1 flex min-h-5 items-center justify-between gap-2">
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        {statusMeta && (
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ring-1 ${statusMeta.className}`}
          >
            {statusMeta.icon === "check" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {statusMeta.label}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => {
            setUncontrolledValue(event.target.value);
            onChange?.(event.target.value);
            setStatus("idle");
          }}
          className="w-full"
          placeholder="username or user ID"
        />
        <Button
          type="button"
          variant="tertiary"
          onPress={testConnection}
          isDisabled={status === "checking"}
        >
          <MessageCircle className="h-4 w-4" />
          {status === "checking" ? "Testing" : "Test"}
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
