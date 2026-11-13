import { useId } from "react";
import type { SelectHTMLAttributes } from "react";

export type DropdownOption<T extends string = string> = {
  label: string;
  value: T;
};

type DropdownProps<T extends string = string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange"
> & {
  label?: string;
  options: DropdownOption<T>[];
  value?: T;
  onChange?: (value: T) => void;
  placeholder?: string;
  error?: string | undefined;
  helperText?: string;
};

export function Dropdown<T extends string = string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  error,
  helperText,
  id,
  className = "",
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ...props
}: DropdownProps<T>) {
  const fallbackId = useId();
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : fallbackId);
  const messageId = error || helperText ? `${selectId}-message` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={error ? true : invalid}
        aria-describedby={[describedBy, messageId].filter(Boolean).join(" ") || undefined}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value as T)}
        className={[
          "h-9 rounded-md border bg-white px-3 py-2 text-sm text-gray-900",
          "focus:outline-none focus:ring-1",
          error
            ? "border-danger focus:border-danger focus:ring-danger"
            : "border-gray-300 focus:border-primary focus:ring-primary",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400",
          className,
        ].join(" ")}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p id={messageId} className="text-xs text-danger">{error}</p>}
      {!error && helperText && <p id={messageId} className="text-xs text-gray-500">{helperText}</p>}
    </div>
  );
}
