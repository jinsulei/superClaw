---
name: superclaw-ecommerce
description: Evidence-first ecommerce operations through native browser and desktop tools.
---

# SuperClaw Ecommerce Workflow

Use this skill for product research, listing review, pricing comparison,
store operations, and cart preparation. The OpenClaw Gateway performs the
work; the desktop UI only presents progress and asks for confirmation.

## Workflow

1. Identify the target platform, product, store, account, and requested action.
2. Use the current browser page when available. For an already-open desktop
   client, call `desktop_control` before creating browser work.
3. Inspect and retain evidence: URL or window title, product name, variant,
   price, stock, shipping, promotion, and any failure message.
4. Summarize findings with concrete evidence. Do not state that a page was
   inspected when no native tool result was returned.
5. For a reversible draft, cart preparation, or comparison, report the exact
   pending state. For order submit, payment, publish, message send, or account
   changes, stop and request explicit confirmation in the current task.

## Browser Discipline

- Reuse the current browser context and active page. Do not create a second
  tab or page unless the user approves it after being told why it is needed.
- Preserve the existing login session. Do not ask the user to re-authenticate
  merely because a link opened a popup; navigate the current page instead.

## Deliverable

Return a concise result, the evidence source, pending confirmation if any, and
the concrete blocker when execution cannot continue.
