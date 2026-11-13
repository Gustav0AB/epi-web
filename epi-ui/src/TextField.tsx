import { useId } from "react";
import type { InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | undefined;
  helperText?: string;
};

export function TextField({
  label,
  error,
  helperText,
  id,
  className = "",
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  ...props
}: TextFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : fallbackId);
  const messageId = error || helperText ? `${inputId}-message` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : invalid}
        aria-describedby={[describedBy, messageId].filter(Boolean).join(" ") || undefined}
        className={[
          "rounded-md border px-3 py-2 text-sm text-gray-900 placeholder-gray-400",
          "focus:outline-none focus:ring-1",
          error
            ? "border-danger focus:border-danger focus:ring-danger"
            : "border-gray-300 focus:border-primary focus:ring-primary",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400",
          className,
        ].join(" ")}
        {...props}
      />
      {error && <p id={messageId} className="text-xs text-danger">{error}</p>}
      {!error && helperText && <p id={messageId} className="text-xs text-gray-500">{helperText}</p>}
    </div>
  );
}
