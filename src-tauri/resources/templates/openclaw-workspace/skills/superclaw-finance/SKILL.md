---
name: superclaw-finance
description: Local financial document analysis, reconciliation, and draft preparation with confirmation boundaries.
---

# SuperClaw Finance Workflow

Use this skill for user-authorized financial files, screenshots, statements,
and local reports. It is for analysis and drafts, not autonomous money movement.

## Workflow

1. Confirm the user-authorized source files, period, currency, and requested
   output before reading records.
2. Use `superclaw_ocr` only when a supplied image or screenshot contains text
   that must be read. Keep the source and OCR output as evidence.
3. Use native file or calculation tools to classify, reconcile, calculate, and
   produce a local draft. State assumptions, discrepancies, and missing data.
4. Return a traceable summary: inputs, calculations, generated artifact, and
   unresolved items.

## Confirmation Boundary

Never transfer funds, pay, submit a filing, delete records, or send external
financial material without an explicit confirmation in the current task. Before
that point, prepare only the reviewable draft and clearly name the pending
irreversible action.
