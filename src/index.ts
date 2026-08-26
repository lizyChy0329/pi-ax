import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ensureAxInstalled } from "./install";
import { webExtractParams, buildAxArgs, runAx } from "./web_extract";

export default function (pi: ExtensionAPI) {
  let installed = false;

  // --- Auto-install ax on first session ---
  pi.on("session_start", async (_event, ctx) => {
    if (installed) return;
    installed = ensureAxInstalled();
    if (!installed) {
      ctx.ui.notify(
        "⚠️  ax not found. Install: curl -fsSL https://ax.yusuke.run/install | sh",
        "warning",
      );
    }
  });

  // --- Register the web_extract tool ---
  pi.registerTool({
    name: "web_extract",
    label: "Web Extract (ax)",
    description: `Extract structured data from any URL using the ax CLI (Rust-based, token-cheap).

THIS is the primary web extraction tool — prefer it over fetch_content for:
• Structured data: tables, lists, cards, search results, product grids
• REST API calls: full HTTP report with status, headers, timing, auto-parsed JSON
• Page structure discovery: find the right CSS selectors before extracting
• Markdown conversion: readable docs with a token budget
• Text location: find which CSS selector holds a specific string
• Local HTML files: parse any .html file

Use fetch_content INSTEAD for:
• YouTube video content
• PDF documents
• GitHub repository analysis
• Plain articles where you just want readable text (no selectors needed)

Key modes:
  fetch    — Full HTTP report: {status, ok, url, redirected, ms, headers, body}.
             Always live (no cache). Supports -H, -X, -d, -u, -k.
             Auto-parses JSON response bodies.
  outline  — Discover page structure: lists repeating tag.class patterns + counts.
             ALWAYS run this first on an unknown page before extracting.
  locate   — Find which CSS selector holds a specific text string.
  extract  — Multi-field row extraction via CSS selectors.
             e.g. selector='.card', fields='title=a, href=a@href, price=.price'
             Use parent container as row selector, child elements as fields.
             For element attributes: 'id=@data-id' or 'href=a@href'
             For text content: '@innerText' or '@innerHTML' (on parent, not <a> itself)
  table    — Extract HTML <table> as keyed rows (column names from <th> headers).
  markdown — Convert page to readable markdown. Use budget for token control.
  parse    — Raw page content with ~2min URL cache. Use --fresh to bypass.

Output formats:
  Default: TSV (most token-efficient, ~1/3 the tokens of JSON)
  json: true → JSON output
  envelope: true → {data, meta} for pagination continuation

Pagination (continuation):
  Use envelope=true + offset from previous meta.next_offset.
  Keep the same selector/fields/where; only change offset.
  Stop when meta.state is "complete" or "past_end".

Cache:
  parse mode: ~2min URL cache (cache hits ~110ms vs cold ~500ms)
  fetch mode: never cached, always live
  Use fresh: true to bypass cache on any mode`,
    parameters: webExtractParams,

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      // Ensure ax is installed before each call
      if (!installed) {
        installed = ensureAxInstalled();
        if (!installed) {
          return {
            content: [{
              type: "text",
              text: "ax is not installed. Run `curl -fsSL https://ax.yusuke.run/install | sh` or install @lizychy0329/pi-ax via pi.",
            }],
            isError: true,
            details: {},
          };
        }
      }

      try {
        const args = buildAxArgs(params as any);
        const { stdout, stderr } = runAx(args, signal);

        // ax writes extraction metadata (row count, truncation notes, cache hits)
        // to stderr. Include it so the LLM can see it.
        let text = stdout;
        if (stderr) {
          const notes = stderr.trim();
          if (notes) {
            text += "\n\n" + notes;
          }
        }

        // Extract row count from stderr for details
        const rowMatch = /^(\d+)\s+rows?\s+extracted/im.exec(stderr);
        const details: Record<string, unknown> = {};
        if (rowMatch) {
          details.rows = parseInt(rowMatch[1], 10);
        }

        // Extract truncation/offset hint from stderr for guidance
        const offsetMatch = /--offset\s+(\d+)/i.exec(stderr);
        if (offsetMatch) {
          details.next_offset = parseInt(offsetMatch[1], 10);
        }

        return {
          content: [{ type: "text", text }],
          details,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
          details: {},
        };
      }
    },
  });
}
