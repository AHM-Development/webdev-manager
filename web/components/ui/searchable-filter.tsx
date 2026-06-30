"use client";

import {
  Autocomplete,
  Label,
  ListBox,
  ListBoxItem,
  SearchField,
  useFilter,
} from "@heroui/react";

export type SearchableFilterOption = {
  key: string;
  label: string;
  description?: string;
};

export function SearchableFilter({
  ariaLabel,
  value,
  options,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder,
  className,
  triggerClassName,
}: {
  ariaLabel: string;
  value: string;
  options: SearchableFilterOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  const selected = options.find((option) => option.key === value);

  return (
    <Autocomplete
      aria-label={ariaLabel}
      selectedKey={value || null}
      onSelectionChange={(key) => onChange(key ? String(key) : "")}
      onClear={() => onChange(options[0]?.key ?? "")}
      className={className ?? "w-auto shrink-0"}
    >
      <Label className="sr-only">{ariaLabel}</Label>
      <Autocomplete.Trigger className={triggerClassName ?? "w-40"}>
        <Autocomplete.Value>{selected?.label ?? placeholder}</Autocomplete.Value>
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField aria-label={`Search ${ariaLabel.toLowerCase()}`}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input
                autoFocus
                placeholder={searchPlaceholder ?? `Search ${ariaLabel.toLowerCase()}...`}
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox>
            {options.map((option) => (
              <ListBoxItem
                key={option.key}
                id={option.key}
                textValue={`${option.label} ${option.description ?? ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{option.label}</p>
                  {option.description && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {option.description}
                    </p>
                  )}
                </div>
              </ListBoxItem>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
