import { describe, it, expect } from "vitest";
import { buildAxArgs, runAx } from "../src/web_extract";
import { execSync } from "node:child_process";

// ──────────────────────────────────────────────
// End-to-end integration: real ax binary
// Only runs when ax is available in PATH.
// These tests hit real URLs, so CI should be
// fast enough with the 2min URL cache.
// ──────────────────────────────────────────────
describe("integration: real ax", () => {
  let axAvailable = true;
  try {
    execSync("ax --version", { stdio: "ignore" });
  } catch {
    axAvailable = false;
  }

  it(axAvailable ? "fetch mode returns HTTP report with status 200" : "skipped - ax not found", async () => {
    if (!axAvailable) return;

    const args = buildAxArgs({ url: "https://httpbin.org/get", mode: "fetch" });
    expect(args).toEqual(["https://httpbin.org/get", "--fetch"]);

    const result = runAx(args);
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("200");
  }, 30_000);

  it(axAvailable ? "outline mode discovers page structure" : "skipped - ax not found", async () => {
    if (!axAvailable) return;

    const args = buildAxArgs({ url: "https://example.com", mode: "outline" });
    expect(args).toEqual(["https://example.com", "--outline"]);

    const result = runAx(args);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it(axAvailable ? "parse mode returns cached page content" : "skipped - ax not found", async () => {
    if (!axAvailable) return;

    const args = buildAxArgs({ url: "https://example.com", mode: "parse" });
    expect(args).toEqual(["https://example.com"]);

    const result = runAx(args);
    expect(result.stdout).toContain("Example Domain");
  });

  it(axAvailable ? "fresh flag bypasses cache" : "skipped - ax not found", async () => {
    if (!axAvailable) return;

    const args = buildAxArgs({ url: "https://example.com", mode: "parse", fresh: true });
    expect(args).toEqual(["https://example.com", "--fresh"]);

    const result = runAx(args);
    expect(result.stdout).toContain("Example Domain");
  });

  it(axAvailable ? "markdown mode converts to readable markdown" : "skipped - ax not found", async () => {
    if (!axAvailable) return;

    const args = buildAxArgs({ url: "https://example.com", mode: "markdown" });
    expect(args).toEqual(["https://example.com", "--md"]);

    const result = runAx(args);
    expect(result.stdout).toContain("Example Domain");
  });

  it(axAvailable ? "extract mode returns TSV output" : "skipped - ax not found", async () => {
    if (!axAvailable) return;

    const args = buildAxArgs({
      url: "https://httpbin.org/html",
      mode: "extract",
      selector: "div",
      fields: "para=p@innerText",
    });

    const result = runAx(args);
    // TSV header "para" should be present; actual data depends on DOM parsing
    expect(result.stdout).toContain("para");
  });

  it(axAvailable ? "404 HTTP error does not throw, returns report" : "skipped - ax not found", async () => {
    if (!axAvailable) return;

    const args = buildAxArgs({ url: "https://httpbin.org/status/404", mode: "fetch" });

    const result = runAx(args);
    expect(result.stdout).toContain("404");
  }, 30_000);
});
