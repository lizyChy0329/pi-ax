import { Type } from "typebox";
import { spawnSync } from "node:child_process";

/**
 * Parameter schema for the web_extract tool.
 *
 * Designed to cover the most common ax workflows:
 *   fetch, outline, locate, extract, table, markdown.
 */
export const webExtractParams = Type.Object({
  url: Type.String({ description: "URL to fetch (e.g. https://example.com)" }),

  mode: Type.Enum({
    fetch: "Fetch with full HTTP report: status, ok, url, redirected, ms, headers, body. Use for REST APIs too.",
    outline: "Discover page structure: shows repeating tag.class patterns with counts. Use before extract on an unknown page.",
    locate: "Find which CSS selector holds a given text string. Use when you know the text content but not the selector.",
    extract: "Extract structured multi-field rows from repeating elements via CSS selector. The main extraction mode.",
    table: "Extract HTML <table> as keyed rows. Column names come from table headers.",
    markdown: "Convert page to readable markdown. Good for documentation pages, with optional --budget for token control.",
  }, { description: "Operation mode" }),

  // Mode-specific parameters
  selector: Type.Optional(Type.String({ description: "CSS selector for extract/table/locate/count modes" })),
  fields: Type.Optional(Type.String({ description: "Row fields for extract mode, e.g. 'title=a, href=a@href, id=@data-id, price=.price'. Empty selector (@id) reads attribute of the matched element itself." })),
  query: Type.Optional(Type.String({ description: "Text to locate (for locate mode) or filter expression for extract/table (e.g. 'price > 100 && name ~ /^foo/i')" })),

  // Output control
  budget: Type.Optional(Type.Number({ description: "Target token budget for markdown/extract output. Cuts at item boundaries." })),
  limit: Type.Optional(Type.Number({ description: "Max rows to return (default 50, use -1 for all). Truncation is always announced on stderr with the exact --offset to continue from." })),
  offset: Type.Optional(Type.Number({ description: "Pagination offset for continuation. Set to the meta.next_offset from a previous --json-envelope result." })),
  json: Type.Optional(Type.Boolean({ description: "Output as JSON instead of the default compact TSV" })),
  envelope: Type.Optional(Type.Boolean({ description: "Use --json-envelope for continuation support: stdout becomes {data, meta}. Continue only while meta.state is 'more'." })),

  // HTTP request control
  headers: Type.Optional(Type.Array(Type.String(), { description: "Custom HTTP headers, e.g. ['authorization: Bearer x', 'accept: application/json']" })),
  method: Type.Optional(Type.Enum({ GET: "GET", POST: "POST", PUT: "PUT", DELETE: "DELETE", HEAD: "HEAD" }, { description: "HTTP method for fetch mode (default: GET)" })),
  body: Type.Optional(Type.String({ description: "Request body for fetch mode (POST/PUT). Use @filepath to read from a file." })),
  auth: Type.Optional(Type.String({ description: "Basic authentication as 'user:pass'" })),
  insecure: Type.Optional(Type.Boolean({ description: "Skip TLS verification (-k flag). Use for self-signed certs." })),
});

export type WebExtractParams = {
  url: string;
  mode: string;
  selector?: string;
  fields?: string;
  query?: string;
  budget?: number;
  limit?: number;
  offset?: number;
  json?: boolean;
  envelope?: boolean;
  headers?: string[];
  method?: string;
  body?: string;
  auth?: string;
  insecure?: boolean;
};

/**
 * Build the ax CLI argument array from structured parameters.
 */
export function buildAxArgs(params: WebExtractParams): string[] {
  const args: string[] = [params.url];

  switch (params.mode) {
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

    case "fetch":
      // No extra positional args for fetch mode
      // But we do support -H, -X, -d, -u etc.
      break;
  }

  // Output control
  if (params.budget !== undefined) args.push("--budget", String(params.budget));
  if (params.limit !== undefined) args.push("--limit", String(params.limit));
  if (params.offset !== undefined) args.push("--offset", String(params.offset));
  if (params.json) args.push("--json");
  if (params.envelope) args.push("--json-envelope");

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