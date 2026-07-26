import { useMemo, useState, useRef, useEffect } from "react";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useI18n } from "../../lib/i18n";

type DatePickerProps = {
  label?: string;
  value: string; // YYYY-MM-DD or ""
  onChange: (value: string) => void;
  placeholder?: string;
};

// Domingo 2023-01-01 .. Sábado 2023-01-07: semana de referencia para nombres de día.
const WEEK_REF = new Date(2023, 0, 1);

function parseLocal(iso: string): Date {
  // Avoids timezone shifts from new Date("YYYY-MM-DD")
  const parts = iso.split("-").map(Number);
  return new Date(parts[0]!, parts[1]! - 1, parts[2]);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DatePicker({ label, value, onChange, placeholder }: DatePickerProps) {
  const { lang, t } = useI18n();
  const locale = lang === "es" ? "es-MX" : "en-US";
  const MONTHS = useMemo(
    () => Array.from({ length: 12 }, (_, m) => new Date(2023, m, 1).toLocaleDateString(locale, { month: "long" })),
    [locale]
  );
  const DAYS = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(WEEK_REF);
        d.setDate(WEEK_REF.getDate() + i);
        return d.toLocaleDateString(locale, { weekday: "short" });
      }),
    [locale]
  );
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    if (value) return parseLocal(value);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const sel = value ? parseLocal(value) : null;
  const isSelected = (day: number) =>
    sel !== null && day === sel.getDate() && month === sel.getMonth() && year === sel.getFullYear();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  function select(day: number) {
    onChange(toISO(new Date(year, month, day)));
    setOpen(false);
  }

  const displayValue = value
    ? parseLocal(value).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
    : "";

  return (
    <div className="relative flex flex-col gap-1" ref={ref}>
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <span className={displayValue ? "text-gray-900" : "text-gray-400"}>
          {displayValue || placeholder || t("datePicker.placeholder")}
        </span>
        <CalendarTodayOutlinedIcon className="text-gray-400" style={{ fontSize: 16 }} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          {/* Month navigation */}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
            >
              <ChevronLeftIcon style={{ fontSize: 20 }} />
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {capitalize(MONTHS[month]!)} {year}
            </span>
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
            >
              <ChevronRightIcon style={{ fontSize: 20 }} />
            </button>
          </div>

          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {DAYS.map((d) => (
              <span key={d} className="py-1 text-xs font-medium text-gray-400">{d}</span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {cells.map((day, i) => (
              <div key={i} className="aspect-square p-0.5">
                {day !== null && (
                  <button
                    type="button"
                    onClick={() => select(day)}
                    className={[
                      "h-full w-full rounded-full text-sm font-medium transition-colors",
                      isSelected(day)
                        ? "bg-primary text-white"
                        : isToday(day)
                        ? "border border-primary text-primary"
                        : "text-gray-700 hover:bg-gray-100",
                    ].join(" ")}
                  >
                    {day}
                  </button>
                )}
              </div>
            ))}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600"
            >
              {t("datePicker.clear")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
