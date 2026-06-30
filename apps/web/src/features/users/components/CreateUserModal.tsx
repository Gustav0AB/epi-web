import { useState } from "react";
import { FEATURES_REGISTRY, ALL_FEATURE_KEYS } from "@epi/shared";
import { Button, Dropdown, Modal, TextField } from "../../../shared/components";
import type { DropdownOption } from "../../../shared/components";
import type { CreateUserDto } from "@epi/shared";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateUserDto) => Promise<void>;
};

const roleOptions: DropdownOption[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

const initialForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "user" as "admin" | "user",
  featureKeys: [] as string[],
};

export function CreateUserModal({ open, onClose, onSubmit }: Props) {
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setForm(initialForm);
    setError(null);
    onClose();
  }

  function toggleFeature(key: string) {
    setForm((f) => ({
      ...f,
      featureKeys: f.featureKeys.includes(key)
        ? f.featureKeys.filter((k) => k !== key)
        : [...f.featureKeys, key],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...form,
        featureKeys: form.role === "admin" ? ALL_FEATURE_KEYS : form.featureKeys,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add New User"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-user-form" loading={isSubmitting}>
            Create User
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Full Name"
            id="name"
            required
            placeholder="Jane Doe"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            label="Username"
            id="username"
            required
            placeholder="jane_doe"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
          />
        </div>

        <TextField
          label="Email"
          id="email"
          type="email"
          required
          placeholder="jane@example.com"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />

        <TextField
          label="Password"
          id="password"
          type="password"
          required
          placeholder="Min. 8 characters"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />

        <Dropdown
          label="Role"
          id="role"
          options={roleOptions}
          value={form.role}
          onChange={(val) =>
            setForm((f) => ({ ...f, role: val as "admin" | "user", featureKeys: [] }))
          }
        />

        {/* Feature checkboxes — only shown for USER role */}
        {form.role === "user" && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Allowed Features</p>
            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              {Object.values(FEATURES_REGISTRY).map((feature) => (
                <label
                  key={feature.key}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary"
                    checked={form.featureKeys.includes(feature.key)}
                    onChange={() => toggleFeature(feature.key)}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{feature.name}</p>
                    <p className="text-xs text-gray-500">{feature.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {form.role === "admin" && (
          <p className="rounded-md bg-primary-muted px-3 py-2 text-sm text-primary">
            Admin users have access to all features automatically.
          </p>
        )}

        {error && (
          <p className="rounded-md bg-danger-muted px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </form>
    </Modal>
  );
}
