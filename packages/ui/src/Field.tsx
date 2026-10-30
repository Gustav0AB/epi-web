import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type FieldKind = "text" | "textarea" | "select" | "checkbox" | "file";
type FieldProps = {
  as?: FieldKind;
  label?: string;
  options?: { label: string; value: string }[];
  children?: ReactNode;
  type?: string;
  error?: string;
  helperText?: string;
  className?: string;
  value?: string | number | readonly string[];
  onChange?: (event: any) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type"> &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className"> &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "className">;

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ as = "text", label, options = [], children, type, error, helperText, id, className = "", ...props }, ref) {
  const fieldId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  const base = "rounded-md border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400";
  const classes = `${base} ${error ? "border-danger focus:border-danger focus:ring-danger" : "border-gray-300 focus:border-primary focus:ring-primary"} ${className}`;
  const common = { ...props, ref: as === "text" || as === "checkbox" || as === "file" ? ref : undefined, id: fieldId, className: as === "checkbox" ? `h-4 w-4 rounded border-gray-300 accent-primary ${className}` : classes } as any;
  let control;
  if (as === "textarea") control = <textarea {...common} />;
  else if (as === "select") control = <select {...common}>{children ?? options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
  else control = <input {...common} type={as === "text" ? type ?? "text" : as} />;
  if (as === "checkbox") return <label htmlFor={fieldId} className={`flex cursor-pointer items-center gap-2 ${className}`}>{control}{label}</label>;
  return <div className="flex flex-col gap-1">{label && <label htmlFor={fieldId} className="text-sm font-medium text-gray-700">{label}</label>}{control}{error && <p className="text-xs text-danger">{error}</p>}{!error && helperText && <p className="text-xs text-gray-500">{helperText}</p>}</div>;
});
