"use client";

import intlTelInput, { type Iso2, type Iti } from "intl-tel-input";
import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PhoneStatus = "idle" | "valid" | "invalid";

const dialCodeToCountry: Record<string, Iso2> = {
  "+971": "ae",
  "+44": "gb",
  "+63": "ph",
  "+1": "us",
};

const statusContent: Partial<
  Record<PhoneStatus, { label: string; className: string; icon: "check" | "x" }>
> = {
  valid: {
    label: "Valid",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: "check",
  },
  invalid: {
    label: "Invalid",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    icon: "x",
  },
};

export function InternationalPhoneInput({
  label = "Phone Number",
  defaultCountryCode = "+971",
  defaultValue = "",
  value,
  onChange,
  helperText,
  error,
  className = "",
}: {
  label?: string;
  defaultCountryCode?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  helperText?: string;
  error?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const instanceRef = useRef<Iti | null>(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<PhoneStatus>("idle");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (value !== undefined && inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  useEffect(() => {
    if (!inputRef.current) return;

    const input = inputRef.current;
    const instance = intlTelInput(input, {
      countrySearch: true,
      dropdownParent: document.body,
      formatAsYouType: true,
      initialCountry: dialCodeToCountry[defaultCountryCode] ?? "ae",
      loadUtils: () => import("intl-tel-input/utils"),
      separateDialCode: true,
      strictMode: true,
    });

    instanceRef.current = instance;

    if (value || defaultValue) {
      input.value = value || defaultValue;
    }

    const validate = () => {
      const value = input.value.trim();
      onChangeRef.current?.(instance.getNumber() || value);

      if (!value) {
        setStatus("idle");
        return;
      }

      setStatus(instance.isValidNumber() ? "valid" : "invalid");
    };

    input.addEventListener("blur", validate);
    input.addEventListener("input", validate);
    input.addEventListener("countrychange", validate);

    return () => {
      input.removeEventListener("blur", validate);
      input.removeEventListener("input", validate);
      input.removeEventListener("countrychange", validate);
      instance.destroy();
      instanceRef.current = null;
    };
  }, [defaultCountryCode, defaultValue]);

  const statusMeta = statusContent[status];

  return (
    <div className={`phone-input ${className}`}>
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
      <input
        ref={inputRef}
        type="tel"
        name="phone"
        autoComplete="tel"
        placeholder="55 123 4567"
        className="iti__tel-input"
      />
      {helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
