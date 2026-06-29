import type { HTMLAttributes } from "react";

type Variant = "title" | "subtitle" | "label" | "caption";

const variantClasses: Record<Variant, string> = {
  title: "text-xl font-semibold text-gray-900",
  subtitle: "text-base font-medium text-gray-700",
  label: "text-sm font-medium text-gray-700",
  caption: "text-xs text-gray-500",
};

const variantTag: Record<Variant, keyof React.JSX.IntrinsicElements> = {
  title: "h2",
  subtitle: "h3",
  label: "span",
  caption: "span",
};

type LabelProps = HTMLAttributes<HTMLElement> & {
  variant?: Variant;
  as?: keyof React.JSX.IntrinsicElements;
  htmlFor?: string;
};

export function Label({
  variant = "label",
  as,
  children,
  className = "",
  ...props
}: LabelProps) {
  const Tag = (as ?? variantTag[variant]) as React.ElementType;

  return (
    <Tag
      className={[variantClasses[variant], className].join(" ")}
      {...props}
    >
      {children}
    </Tag>
  );
}
