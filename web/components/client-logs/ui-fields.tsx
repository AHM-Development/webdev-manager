"use client";

import {
  Calendar,
  Checkbox,
  DateField,
  DatePicker,
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import type { DateValue } from "react-aria-components";
import type { ReactNode } from "react";

export type Option = { value: string; label: string };

/** HeroUI Select with a plain options array + placeholder. */
export function SelectField({
  ariaLabel,
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      aria-label={ariaLabel}
      selectedKey={value || null}
      onSelectionChange={(key) => onChange(key ? String(key) : "")}
      className={className}
    >
      <SelectTrigger className="w-full">
        <SelectValue>{selected ? selected.label : (placeholder ?? "Select…")}</SelectValue>
        <SelectIndicator />
      </SelectTrigger>
      <SelectPopover>
        <ListBox>
          {options.map((option) => (
            <ListBoxItem key={option.value} id={option.value}>
              {option.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </SelectPopover>
    </Select>
  );
}

function toDateValue(value?: string | null): DateValue | null {
  if (!value) return null;
  try {
    return parseDate(value.slice(0, 10));
  } catch {
    return null;
  }
}

/** HeroUI DatePicker taking/returning a plain YYYY-MM-DD string. */
export function DateInput({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel?: string;
  value?: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <DatePicker
      aria-label={ariaLabel}
      value={toDateValue(value)}
      onChange={(next) => onChange(next ? next.toString() : "")}
      className="w-full"
    >
      <DateField.Group fullWidth>
        <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      {/* HeroUI clamps the popover to the trigger width (max-width: var(--trigger-width)),
          which clips the calendar's right-hand columns inside narrow drawer fields. A
          min-width wins over max-width in CSS, so this guarantees the full grid shows. */}
      <DatePicker.Popover placement="bottom start" className="min-w-[18rem]">
        <Calendar>
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody>
              {({ year }) => <Calendar.YearPickerCell year={year} />}
            </Calendar.YearPickerGridBody>
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
}

/** HeroUI Checkbox with an inline label. */
export function CheckboxField({
  isSelected,
  onChange,
  children,
  className,
}: {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Checkbox isSelected={isSelected} onChange={onChange} className={`flex items-center gap-2 text-sm text-slate-700 ${className ?? ""}`}>
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <span>{children}</span>
    </Checkbox>
  );
}
