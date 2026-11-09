import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pagination } from "@epi/ui";

describe("server pagination", () => {
  it("shows the last page count without offering a next page", () => {
    const html = renderToStaticMarkup(createElement(Pagination, {
      meta: { page: 3, pageSize: 10, total: 23, totalPages: 3 }, onPageChange: () => {},
    }));
    expect(html).toContain("21–23");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
  it("disables both directions for an empty result", () => {
    const html = renderToStaticMarkup(createElement(Pagination, {
      meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 }, onPageChange: () => {},
    }));
    expect(html).toContain("0–0");
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).not.toContain("1 / 0");
  });
});
