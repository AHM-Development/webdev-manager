"use client";

import { Calendar, DateField, DatePicker } from "@heroui/react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import type { DateValue } from "react-aria-components";
import { useMemo, useState } from "react";

export function DateOfBirthField({
  label = "Date of Birth",
  value,
  onChange,
  error,
  className = "",
}: {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  className?: string;
}) {
  const parsedValue = useMemo(() => {
    if (!value) return null;
    try {
      return parseDate(value);
    } catch {
      return null;
    }
  }, [value]);
  const [uncontrolledValue, setUncontrolledValue] = useState<DateValue | null>(null);
  const currentValue = value !== undefined ? parsedValue : uncontrolledValue;
  const maxDate = today(getLocalTimeZone());
  const minDate = parseDate("1900-01-01");

  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <DatePicker
        aria-label={label}
        value={currentValue}
        onChange={(nextValue) => {
          setUncontrolledValue(nextValue);
          onChange?.(nextValue ? nextValue.toString() : "");
        }}
        minValue={minDate}
        maxValue={maxDate}
        placeholderValue={parseDate("1990-01-01")}
        className="w-full"
      >
        <DateField.Group fullWidth>
          <DateField.Input>
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <DatePicker.Trigger>
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DatePicker.Popover placement="bottom start">
          <Calendar
            aria-label={label}
            defaultYearPickerOpen
            minValue={minDate}
            maxValue={maxDate}
          >
            <Calendar.Header>
              <Calendar.YearPickerTrigger>
                <Calendar.YearPickerTriggerHeading />
                <Calendar.YearPickerTriggerIndicator />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
              </Calendar.GridHeader>
              <Calendar.GridBody>
                {(date) => <Calendar.Cell date={date} />}
              </Calendar.GridBody>
            </Calendar.Grid>
            <Calendar.YearPickerGrid>
              <Calendar.YearPickerGridBody>
                {({ year }) => <Calendar.YearPickerCell year={year} />}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
