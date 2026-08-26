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
    description: `Fetch and extract structured data from any URL using the ax CLI.

Use this tool INSTEAD of fetch_content when you need to:
• Extract structured data from HTML (tables, lists, cards) via CSS selectors
• Discover a page's structure before extracting (outline → locate → extract)
• Call REST APIs with full HTTP status/headers/timing report
• Extract HTML <table> elements as keyed rows
• Get a page as markdown with a token budget limit

Use fetch_content INSTEAD for:
• YouTube/PDF/GitHub repo analysis
• Plain readable markdown of articles (when you don't need CSS selectors)

Key modes:
  fetch     – Full HTTP report: {status, ok, url, redirected, ms, headers, body}.
              Supports -H, -X, -d, -u, -k. JSON bodies are auto-parsed.
  outline   – Discover page structure: lists repeating tag.class patterns + counts.
              Run this before extract on an unknown page.
  locate    – Find which CSS selector holds a specific text string.
  extract   – Multi-field row extraction via CSS selectors.
              e.g. '.card' with fields 'title=a, href=a@href, price=.price'
  table     – Extract HTML <table> as keyed rows (column names from headers).
  markdown  – Convert page to readable markdown. Use --budget for token control.

Continuation (pagination):
  Use envelope=true + offset from previous meta.next_offset.
  Keep the same selector/fields/where; only change offset.
  Stop when meta.state is "complete" or "past_end".`,
    parameters: webExtractParams,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
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
          // Strip leading/trailing whitespace from stderr
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