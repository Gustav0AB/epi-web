import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "@epi/login";

describe("reusable login form", () => {
  it("defaults to Spanish and retains accessible credential fields", () => {
    const html = renderToStaticMarkup(<LoginForm onSubmit={() => {}} />);
    expect(html).toContain("Iniciar sesión");
    expect(html).toContain('for="username"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html.match(/required=""/g)).toHaveLength(2);
  });
  it("supports English, loading, custom brand and escaped public errors", () => {
    const html = renderToStaticMarkup(<LoginForm locale="en" loading error="<script>" brand={<h1>Another project</h1>} onSubmit={() => {}} />);
    expect(html).toContain("Loading…");
    expect(html).toContain("Another project");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('role="alert"');
    expect(html).toContain("&lt;script&gt;");
  });
});
