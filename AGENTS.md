<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Documentation ownership

Three layers, three different rules. This applies to all work, not just the
[doc-update workflow](workflows/doc-update.md).

| Path | You may | Notes |
|---|---|---|
| `raw/` | **Add files only** | Append-only source of truth. Never edit or delete an existing file. Correct a mistake by adding a new file. |
| `wiki/` | **Edit freely** | Your knowledge base. Keep it current as you work — fold new facts into the relevant page rather than appending. |
| `docs/`, `README.md` | **Never edit** | Suggest changes with evidence; the human applies them. |

**Do not edit `README.md` or anything in `docs/`.** They are what a new
contributor trusts, and `docs/RUNBOOK.md` tells someone what to do during an
incident — a confidently-worded wrong instruction there is worse than none. If
you find them wrong or stale, say so and propose the exact replacement with
evidence (a commit, a `file:line`, a query result), then leave them alone.

This is the one boundary to respect even when a change looks obviously
correct and trivial.
