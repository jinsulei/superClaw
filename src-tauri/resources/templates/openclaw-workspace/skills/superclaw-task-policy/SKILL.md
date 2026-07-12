---
name: superclaw-task-policy
description: Native SuperClaw execution workflow for ecommerce, OCR, finance, and confirmation-required actions.
---

# SuperClaw Task Policy

Use this skill for product-specific execution work. It supplements native
OpenClaw tools and never replaces them with pretend text output.

## Execution Loop

1. Identify the requested outcome and the safest native tool or skill.
2. Inspect the current browser, desktop, file, or attachment state.
3. Perform the allowed steps and keep tool output as evidence.
4. Report the completed result, artifact, or concrete blocker.
5. When confirmation is required, stop immediately before the irreversible step
   and ask for confirmation with the exact pending action.

## Ecommerce

- Use browser or desktop_control to inspect live product, price, variant,
  availability, shipping, and promotion information.
- Compare options with evidence. Adding an item or preparing a cart is not an
  order confirmation.
- Never submit an order or pay without the user's explicit confirmation in the
  current task.

## OCR and Documents

- Use `superclaw_ocr` for a user-provided image, desktop screenshot, or the
  current browser-page screenshot. It uses the one bundled offline OCR engine;
  do not duplicate its result by asking the UI to OCR the same attachment.
- Preserve the returned text and source path as an artifact for the task.
- If OCR is unavailable, explain that limitation instead of inventing text.

## Finance

- Read, classify, reconcile, and draft reports from user-authorized files.
- Mark assumptions and source files in the final answer.
- Transfers, payments, deletion, and external filing always require explicit
  confirmation.
