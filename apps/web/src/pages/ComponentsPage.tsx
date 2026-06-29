import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Label,
  List,
  Table,
  TextField,
} from "../shared/components";
import type { Column, DropdownOption } from "../shared/components";

function Section({
  title,
  description,
  children,
  code,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  code: string;
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="border-b border-gray-100 px-6 py-4">
        <Label variant="subtitle">{title}</Label>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-6 p-6 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
          {children}
        </div>
        <pre className="w-full shrink-0 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100 md:w-72">
          <code>{code.trim()}</code>
        </pre>
      </div>
    </Card>
  );
}

// ── sample data ──────────────────────────────────────────────────────────────

type User = { id: string; name: string; email: string; role: string };

const sampleUsers: User[] = [
  { id: "1", name: "Alice Smith", email: "alice@epi.local", role: "ADMIN" },
  { id: "2", name: "Bob Jones", email: "bob@epi.local", role: "USER" },
  { id: "3", name: "Carol White", email: "carol@epi.local", role: "USER" },
];

const tableColumns: Column<Record<string, unknown>>[] = [
  { key: "name", header: "Name" },
  { key: "email", header: "Email" },
  {
    key: "role",
    header: "Role",
    align: "center",
    render: (row) => (
      <Badge color={row["role"] === "ADMIN" ? "purple" : "gray"}>
        {String(row["role"])}
      </Badge>
    ),
  },
];

const roleOptions: DropdownOption[] = [
  { label: "Admin", value: "ADMIN" },
  { label: "User", value: "USER" },
];

// ─────────────────────────────────────────────────────────────────────────────

export function ComponentsPage() {
  const [textValue, setTextValue] = useState("");
  const [role, setRole] = useState<string>("");

  return (
    <div className="space-y-6">
      <Label variant="title">Components</Label>

      {/* Button */}
      <Section
        title="Button"
        description="Variants: primary · secondary · ghost · danger. Sizes: sm · md · lg."
        code={`<Button>Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Danger</Button>
<Button size="sm">Small</Button>
<Button loading>Loading</Button>
<Button disabled>Disabled</Button>`}
      >
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button size="sm">Small</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </Section>

      {/* Label */}
      <Section
        title="Label"
        description="Variants: title · subtitle · label · caption. Renders the appropriate HTML tag by default."
        code={`<Label variant="title">Page title</Label>
<Label variant="subtitle">Section header</Label>
<Label variant="label">Form label</Label>
<Label variant="caption">Helper caption</Label>`}
      >
        <div className="flex flex-col gap-2">
          <Label variant="title">Page title</Label>
          <Label variant="subtitle">Section header</Label>
          <Label variant="label">Form label</Label>
          <Label variant="caption">Helper caption</Label>
        </div>
      </Section>

      {/* Badge */}
      <Section
        title="Badge"
        description="Colors: gray · blue · green · red · yellow · purple."
        code={`<Badge>gray</Badge>
<Badge color="blue">blue</Badge>
<Badge color="green">green</Badge>
<Badge color="red">red</Badge>
<Badge color="yellow">yellow</Badge>
<Badge color="purple">purple</Badge>`}
      >
        <Badge>gray</Badge>
        <Badge color="blue">blue</Badge>
        <Badge color="green">green</Badge>
        <Badge color="red">red</Badge>
        <Badge color="yellow">yellow</Badge>
        <Badge color="purple">purple</Badge>
      </Section>

      {/* TextField */}
      <Section
        title="TextField"
        description="Supports label, placeholder, error, and helperText."
        code={`<TextField
  label="Email"
  placeholder="you@example.com"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
<TextField
  label="With error"
  error="This field is required."
/>
<TextField
  label="With helper"
  helperText="We will never share your email."
/>`}
      >
        <div className="flex w-full flex-col gap-4">
          <TextField
            label="Email"
            placeholder="you@example.com"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
          />
          <TextField label="With error" error="This field is required." />
          <TextField
            label="With helper"
            helperText="We will never share your email."
          />
        </div>
      </Section>

      {/* Dropdown */}
      <Section
        title="Dropdown"
        description="Typed options, placeholder, error, and helperText."
        code={`const options = [
  { label: "Admin", value: "ADMIN" },
  { label: "User",  value: "USER"  },
]

<Dropdown
  label="Role"
  options={options}
  placeholder="Select a role…"
  value={role}
  onChange={setRole}
/>
<Dropdown
  label="With error"
  options={options}
  error="Please select a role."
/>`}
      >
        <div className="flex w-full flex-col gap-4">
          <Dropdown
            label="Role"
            options={roleOptions}
            placeholder="Select a role…"
            value={role}
            onChange={setRole}
          />
          {role && (
            <Label variant="caption">Selected: {role}</Label>
          )}
          <Dropdown
            label="With error"
            options={roleOptions}
            error="Please select a role."
          />
        </div>
      </Section>

      {/* Card */}
      <Section
        title="Card"
        description="White rounded container. Padding: none · sm · md (default) · lg."
        code={`<Card>Default padding (md)</Card>
<Card padding="sm">Small padding</Card>
<Card padding="lg">Large padding</Card>`}
      >
        <Card className="w-40 text-center text-sm text-gray-600">
          md (default)
        </Card>
        <Card padding="sm" className="w-40 text-center text-sm text-gray-600">
          sm
        </Card>
        <Card padding="lg" className="w-40 text-center text-sm text-gray-600">
          lg
        </Card>
      </Section>

      {/* List */}
      <Section
        title="List"
        description="Generic list with renderItem and keyExtractor. Divided rows by default."
        code={`<List
  items={users}
  keyExtractor={(u) => u.id}
  renderItem={(u) => (
    <div className="flex justify-between">
      <span className="font-medium">{u.name}</span>
      <Badge color={u.role === "ADMIN" ? "purple" : "gray"}>
        {u.role}
      </Badge>
    </div>
  )}
/>`}
      >
        <div className="w-full">
          <List
            items={sampleUsers}
            keyExtractor={(u) => u.id}
            renderItem={(u) => (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{u.name}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
                <Badge color={u.role === "ADMIN" ? "purple" : "gray"}>
                  {u.role}
                </Badge>
              </div>
            )}
          />
        </div>
      </Section>

      {/* Table */}
      <Section
        title="Table"
        description="Column definitions with optional custom render, align, loading and empty states."
        code={`const columns = [
  { key: "name",  header: "Name" },
  { key: "email", header: "Email" },
  {
    key: "role",
    header: "Role",
    align: "center",
    render: (row) => (
      <Badge color={row.role === "ADMIN" ? "purple" : "gray"}>
        {row.role}
      </Badge>
    ),
  },
]

<Table
  columns={columns}
  rows={users}
  keyExtractor={(u) => u.id}
/>`}
      >
        <div className="w-full">
          <Table
            columns={tableColumns}
            rows={sampleUsers as unknown as Record<string, unknown>[]}
            keyExtractor={(_, i) => String(i)}
          />
        </div>
      </Section>
    </div>
  );
}
