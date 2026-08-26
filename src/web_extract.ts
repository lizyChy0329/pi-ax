import { Type } from "typebox";
import { spawnSync } from "node:child_process";

/**
 * Parameter schema for the web_extract tool.
 *
 * Designed to cover the most common ax workflows:
 *   fetch, outline, locate, extract, table, markdown, parse.
 *
 * IMPORTANT: Type.Enum uses the KEYS as the actual enum values.
 * The values are display strings for the UI. Keep them short and equal to keys
 * where the switch statement matches on them.
 */
export const webExtractParams = Type.Object({
  url: Type.String({ description: "URL to fetch (e.g. https://example.com) or local file path" }),

  mode: Type.Enum({
    fetch:    "fetch",
    outline:  "outline",
    locate:   "locate",
    extract:  "extract",
    table:    "table",
    markdown: "markdown",
    parse:    "parse",
  }, { description: "Operation mode. fetch=full HTTP report (no cache); outline=structure discovery; locate=find CSS selector for text; extract=structured row extraction; table=HTML table rows; markdown=readable markdown with token budget; parse=raw page content (cached ~2min)" }),

  // Mode-specific parameters
  selector: Type.Optional(Type.String({ description: "CSS selector for extract/table/locate/parse modes" })),
  fields: Type.Optional(Type.String({ description: "Row fields for extract mode, e.g. 'title=a, href=a@href, id=@data-id, price=.price'. Use @attr syntax for element attributes, @innerText/@innerHTML for text content." })),
  query: Type.Optional(Type.String({ description: "For locate mode: text to find. For extract/table mode: filter expression, e.g. 'price > 100 && name ~ /^foo/i'" })),

  // Output control
  budget: Type.Optional(Type.Number({ description: "Target token budget for markdown/extract output. Cuts at item boundaries. Always emits at least 1 item." })),
  limit: Type.Optional(Type.Number({ description: "Max rows to return (default 50, use -1 for all). Truncation announces exact --offset to continue." })),
  offset: Type.Optional(Type.Number({ description: "Pagination offset for continuation. Set to meta.next_offset from a previous --json-envelope result." })),
  json: Type.Optional(Type.Boolean({ description: "Output as JSON instead of compact TSV (TSV is ~1/3 the tokens of JSON)." })),
  envelope: Type.Optional(Type.Boolean({ description: "Use --json-envelope for continuation: stdout becomes {data, meta}. Continue only while meta.state is 'more'. Stop on 'complete' or 'past_end'." })),

  // Cache control
  fresh: Type.Optional(Type.Boolean({ description: "Force a fresh fetch, bypassing the ~2min URL cache. Use when you need real-time data." })),

  // HTTP request control
  headers: Type.Optional(Type.Array(Type.String(), { description: "Custom HTTP headers, e.g. ['authorization: Bearer x', 'accept: application/json']" })),
  method: Type.Optional(Type.Enum({
    GET:    "GET",
    POST:   "POST",
    PUT:    "PUT",
    DELETE: "DELETE",
    HEAD:   "HEAD",
  }, { description: "HTTP method for fetch mode (default: GET)" })),
  body: Type.Optional(Type.String({ description: "Request body for fetch mode (POST/PUT). Use @filepath to read from a file." })),
  auth: Type.Optional(Type.String({ description: "Basic authentication as 'user:pass'" })),
  insecure: Type.Optional(Type.Boolean({ description: "Skip TLS verification (-k flag). Use for self-signed certs." })),
});

export type WebExtractParams = {
  url: string;
  mode: "fetch" | "outline" | "locate" | "extract" | "table" | "markdown" | "parse";
  selector?: string;
  fields?: string;
  query?: string;
  budget?: number;
  limit?: number;
  offset?: number;
  json?: boolean;
  envelope?: boolean;
  fresh?: boolean;
  headers?: string[];
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  body?: string;
  auth?: string;
  insecure?: boolean;
};

/**
 * Build the ax CLI argument array from structured parameters.
 *
 * ax mode mapping:
 *   fetch    → --fetch          (full HTTP report, no cache)
 *   outline  → --outline        (tag.class pattern discovery)
 *   locate   → --locate <text>  (find CSS selector for text)
 *   extract  → <selector> --row <fields>  (structured row extraction)
 *   table    → <selector> --table         (HTML table extraction)
 *   markdown → --md           (readable markdown conversion)
 *   parse    → (no flag)       (default parse mode, cached ~2min)
 */
export function buildAxArgs(params: WebExtractParams): string[] {
  const args: string[] = [params.url];

  switch (params.mode) {
    case "fetch":
      args.push("--fetch");
      break;

    case "outline":
      args.push("--outline");
      break;

    case "locate": {
      if (!params.query && !params.selector) {
        throw new Error("query (text to locate) is required for locate mode");
      }
      args.push("--locate", params.query ?? params.selector!);
      break;
    }

    case "extract": {
      if (!params.selector) throw new Error("selector is required for extract mode");
      args.push(params.selector);
      if (!params.fields) throw new Error("fields is required for extract mode — e.g. 'title=a, href=a@href'");
      args.push("--row", params.fields);
      if (params.query) args.push("--where", params.query);
      break;
    }

    case "table": {
      if (!params.selector) throw new Error("selector is required for table mode (e.g. 'table' or 'table.items')");
      args.push(params.selector, "--table");
      if (params.query) args.push("--where", params.query);
      break;
    }

    case "markdown":
      args.push("--md");
      break;

    case "parse":
      // Default ax mode — just the URL, optionally with selector
      // Used for raw page content (cached ~2min)
      break;
  }

  // Output control
  if (params.budget !== undefined) args.push("--budget", String(params.budget));
  if (params.limit !== undefined) args.push("--limit", String(params.limit));
  if (params.offset !== undefined) args.push("--offset", String(params.offset));
  if (params.json) args.push("--json");
  if (params.envelope) args.push("--json-envelope");

  // Cache control
  if (params.fresh) args.push("--fresh");

  // HTTP request control
  if (params.headers) {
    for (const h of params.headers) {
      args.push("-H", h);
    }
  }
  if (params.method) args.push("-X", params.method);
  if (params.body) args.push("-d", params.body);
  if (params.auth) args.push("-u", params.auth);
  if (params.insecure) args.push("-k");

  return args;
}

/**
 * Execute ax with the given arguments.
 * Returns stdout and stderr separately.
 */
export function runAx(args: string[], signal?: AbortSignal): { stdout: string; stderr: string } {
  const result = spawnSync("ax", args, {
    encoding: "utf-8",
    timeout: 60_000,
    signal,
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "ax is not installed. Run `curl -fsSL https://ax.yusuke.run/install | sh` to install it, " +
        "or run `pi update --extension @lizychy0329/pi-ax` to auto-install it."
      );
    }
    throw result.error;
  }

  // ax uses exit code 22 for HTTP errors with -f flag, but still prints the report
  // Non-zero exit with output is still valid — let content through
  if (result.status !== null && result.status !== 0 && result.status !== 22) {
    throw new Error(`ax exited with code ${result.status}:\n${stderr || stdout}`);
  }

  return { stdout, stderr };
}
