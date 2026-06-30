"use client";

import {
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
} from "@heroui/react";
import { useState } from "react";

const genderOptions = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
];

export function GenderSelect({
  label = "Gender",
  defaultValue,
  value,
  onChange,
  error,
  className = "",
}: {
  label?: string;
  defaultValue?: "male" | "female";
  value?: "male" | "female" | "";
  onChange?: (value: "male" | "female") => void;
  error?: string;
  className?: string;
}) {
  const [selectedKey, setSelectedKey] = useState(defaultValue);
  const currentValue = value !== undefined ? value : selectedKey;

  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <Select
        aria-label={label}
        selectedKey={currentValue || undefined}
        onSelectionChange={(key) => {
          var next = String(key) as "male" | "female";
          setSelectedKey(next);
          onChange?.(next);
        }}
      >
        <SelectTrigger>
          <SelectValue>
            {genderOptions.find((option) => option.key === currentValue)?.label ??
              "Select gender"}
          </SelectValue>
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            {genderOptions.map((option) => (
              <ListBoxItem key={option.key} id={option.key}>
                {option.label}
              </ListBoxItem>
            ))}
          </ListBox>
        </SelectPopover>
      </Select>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
