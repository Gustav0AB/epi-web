import { Label } from "./Label.js";

type Props = {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
};

export function CheckboxGroup({ label, options, value, onChange, disabled }: Props) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <Label as="legend">{label}</Label>
      <div className="space-y-1 rounded-lg border border-gray-200 p-3">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-gray-50">
            <input type="checkbox" className="h-4 w-4 accent-primary"
              checked={value.includes(option.value)}
              onChange={() => onChange(value.includes(option.value)
                ? value.filter((id) => id !== option.value) : [...value, option.value])} />
            <span className="text-sm text-gray-800">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
