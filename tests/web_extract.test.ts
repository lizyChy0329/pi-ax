import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildAxArgs } from "../src/web_extract";

// Mock child_process at the module top level so runAx picks it up
vi.mock("node:child_process", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

// ──────────────────────────────────────────────
// Seam: buildAxArgs(params) → string[]
// Pure function — every mode branch, every optional flag, every validation error.
// ──────────────────────────────────────────────

describe("buildAxArgs", () => {
  const url = "https://example.com/page";

  // ---- fetch mode ----
  describe("fetch mode", () => {
    it("adds --fetch flag", () => {
      expect(buildAxArgs({ url, mode: "fetch" })).toEqual([url, "--fetch"]);
    });

    it("supports custom method", () => {
      expect(buildAxArgs({ url, mode: "fetch", method: "POST" })).toEqual([
        url,
        "--fetch",
        "-X",
        "POST",
      ]);
    });

    it("supports request body", () => {
      expect(buildAxArgs({ url, mode: "fetch", body: '{"a":1}' })).toEqual([
        url,
        "--fetch",
        "-d",
        '{"a":1}',
      ]);
    });

    it("supports auth", () => {
      expect(buildAxArgs({ url, mode: "fetch", auth: "user:pass" })).toEqual([
        url,
        "--fetch",
        "-u",
        "user:pass",
      ]);
    });

    it("supports insecure flag", () => {
      expect(buildAxArgs({ url, mode: "fetch", insecure: true })).toEqual([
        url,
        "--fetch",
        "-k",
      ]);
    });
  });

  // ---- outline mode ----
  describe("outline mode", () => {
    it("adds --outline flag", () => {
      expect(buildAxArgs({ url, mode: "outline" })).toEqual([url, "--outline"]);
    });
  });

  // ---- locate mode ----
  describe("locate mode", () => {
    it("adds --locate with query", () => {
      expect(buildAxArgs({ url, mode: "locate", query: "Pricing" })).toEqual([
        url,
        "--locate",
        "Pricing",
      ]);
    });

    it("falls back to selector when query is missing", () => {
      expect(buildAxArgs({ url, mode: "locate", selector: ".title" })).toEqual([
        url,
        "--locate",
        ".title",
      ]);
    });

    it("throws when neither query nor selector is provided", () => {
      expect(() =>
        buildAxArgs({ url, mode: "locate" } as any),
      ).toThrow("query (text to locate) is required for locate mode");
    });
  });

  // ---- extract mode ----
  describe("extract mode", () => {
    it("adds selector + --row with fields", () => {
      expect(
        buildAxArgs({
          url,
          mode: "extract",
          selector: ".card",
          fields: "title=a, href=a@href, price=.price",
        }),
      ).toEqual([
        url,
        ".card",
        "--row",
        "title=a, href=a@href, price=.price",
      ]);
    });

    it("adds --where filter when query provided", () => {
      expect(
        buildAxArgs({
          url,
          mode: "extract",
          selector: ".item",
          fields: "name=a",
          query: "stars >= 30000",
        }),
      ).toEqual([url, ".item", "--row", "name=a", "--where", "stars >= 30000"]);
    });

    it("throws when selector is missing", () => {
      expect(() =>
        buildAxArgs({ url, mode: "extract", fields: "title=a" } as any),
      ).toThrow("selector is required for extract mode");
    });

    it("throws when fields is missing", () => {
      expect(() =>
        buildAxArgs({ url, mode: "extract", selector: ".card" } as any),
      ).toThrow("fields is required for extract mode");
    });
  });

  // ---- table mode ----
  describe("table mode", () => {
    it("adds selector + --table", () => {
      expect(
        buildAxArgs({ url, mode: "table", selector: "table" }),
      ).toEqual([url, "table", "--table"]);
    });

    it("adds --where filter when query provided", () => {
      expect(
        buildAxArgs({
          url,
          mode: "table",
          selector: "table",
          query: "Price > 100",
        }),
      ).toEqual([url, "table", "--table", "--where", "Price > 100"]);
    });

    it("throws when selector is missing", () => {
      expect(() =>
        buildAxArgs({ url, mode: "table" } as any),
      ).toThrow("selector is required for table mode");
    });
  });

  // ---- markdown mode ----
  describe("markdown mode", () => {
    it("adds --md flag", () => {
      expect(buildAxArgs({ url, mode: "markdown" })).toEqual([url, "--md"]);
    });

    it("adds --budget when provided", () => {
      expect(buildAxArgs({ url, mode: "markdown", budget: 800 })).toEqual([
        url,
        "--md",
        "--budget",
        "800",
      ]);
    });
  });

  // ---- parse mode ----
  describe("parse mode", () => {
    it("adds no extra flags (just URL)", () => {
      expect(buildAxArgs({ url, mode: "parse" })).toEqual([url]);
    });

    it("supports --fresh to bypass cache", () => {
      expect(buildAxArgs({ url, mode: "parse", fresh: true })).toEqual([
        url,
        "--fresh",
      ]);
    });
  });

  // ---- cross-mode optional params ----
  describe("optional output params", () => {
    it("adds --limit", () => {
      expect(
        buildAxArgs({ url, mode: "extract", selector: ".card", fields: "title=a", limit: 20 }),
      ).toEqual([url, ".card", "--row", "title=a", "--limit", "20"]);
    });

    it("adds --offset", () => {
      expect(
        buildAxArgs({
          url,
          mode: "extract",
          selector: ".card",
          fields: "title=a",
          offset: 50,
        }),
      ).toEqual([url, ".card", "--row", "title=a", "--offset", "50"]);
    });

    it("adds --json when json=true", () => {
      expect(
        buildAxArgs({
          url,
          mode: "extract",
          selector: ".card",
          fields: "title=a",
          json: true,
        }),
      ).toEqual([url, ".card", "--row", "title=a", "--json"]);
    });

    it("adds --json-envelope when envelope=true", () => {
      expect(
        buildAxArgs({
          url,
          mode: "extract",
          selector: ".card",
          fields: "title=a",
          envelope: true,
        }),
      ).toEqual([url, ".card", "--row", "title=a", "--json-envelope"]);
    });

    it("adds -H for each header", () => {
      expect(
        buildAxArgs({
          url,
          mode: "fetch",
          headers: ["authorization: Bearer x", "accept: application/json"],
        }),
      ).toEqual([
        url,
        "--fetch",
        "-H",
        "authorization: Bearer x",
        "-H",
        "accept: application/json",
      ]);
    });

    it("does not add undefined optional params", () => {
      expect(buildAxArgs({ url, mode: "fetch" })).toEqual([url, "--fetch"]);
    });
  });

  // ---- full integration: all flags at once ----
  it("combines all parameters correctly", () => {
    const result = buildAxArgs({
      url,
      mode: "extract",
      selector: ".card",
      fields: "title=a, href=a@href",
      query: "price > 100",
      budget: 500,
      limit: 10,
      offset: 0,
      json: true,
      envelope: true,
      fresh: true,
      headers: ["x-api: key"],
      method: "GET",
      body: "payload",
      auth: "u:p",
      insecure: true,
    });

    expect(result).toEqual([
      url,
      ".card",
      "--row",
      "title=a, href=a@href",
      "--where",
      "price > 100",
      "--budget",
      "500",
      "--limit",
      "10",
      "--offset",
      "0",
      "--json",
      "--json-envelope",
      "--fresh",
      "-H",
      "x-api: key",
      "-X",
      "GET",
      "-d",
      "payload",
      "-u",
      "u:p",
      "-k",
    ]);
  });
});

// ──────────────────────────────────────────────
// Seam: runAx(args) → { stdout, stderr }
// Spawns `ax` via spawnSync — mock the child_process module.
// ──────────────────────────────────────────────

import { spawnSync as mockSpawnSync } from "node:child_process";
import { runAx } from "../src/web_extract";

describe("runAx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stdout and stderr on success", () => {
    mockSpawnSync.mockReturnValue({
      stdout: "Hello World",
      stderr: "",
      status: 0,
      error: undefined,
    } as any);

    expect(runAx(["https://example.com"])).toEqual({
      stdout: "Hello World",
      stderr: "",
    });
  });

  it("includes stderr output when present", () => {
    mockSpawnSync.mockReturnValue({
      stdout: "data",
      stderr: "5 rows extracted",
      status: 0,
      error: undefined,
    } as any);

    const result = runAx(["https://example.com"]);
    expect(result.stdout).toBe("data");
    expect(result.stderr).toBe("5 rows extracted");
  });

  it("throws when ax is not installed (ENOENT)", () => {
    mockSpawnSync.mockReturnValue({
      stdout: "",
      stderr: "",
      status: null,
      error: { code: "ENOENT" } as NodeJS.ErrnoException,
    } as any);

    expect(() => runAx(["https://example.com"])).toThrow("ax is not installed");
  });

  it("throws on non-zero exit (except HTTP 22)", () => {
    mockSpawnSync.mockReturnValue({
      stdout: "",
      stderr: "some error",
      status: 1,
      error: undefined,
    } as any);

    expect(() => runAx(["https://example.com"])).toThrow("ax exited with code 1");
  });

  it("does NOT throw on HTTP error exit code 22", () => {
    mockSpawnSync.mockReturnValue({
      stdout: '{"status":404}',
      stderr: "HTTP error 404",
      status: 22,
      error: undefined,
    } as any);

    expect(runAx(["https://example.com"])).toEqual({
      stdout: '{"status":404}',
      stderr: "HTTP error 404",
    });
  });

  it("passes AbortSignal to spawnSync", () => {
    mockSpawnSync.mockReturnValue({
      stdout: "",
      stderr: "",
      status: 0,
      error: undefined,
    } as any);

    // Create a fake signal — we just need to verify it gets passed through
    const signal = { aborted: false } as AbortSignal;
    runAx(["https://example.com"], signal);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "ax",
      ["https://example.com"],
      expect.objectContaining({ signal }),
    );
  });
});
