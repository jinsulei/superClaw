---
name: superclaw-ocr
description: Evidence-first offline OCR for user-authorized images, screenshots, and the current browser page.
---

# SuperClaw OCR Workflow

Use this skill only when the user explicitly asks to read text from an image,
screenshot, document image, or current browser page, or when image text is
necessary to complete the active task. It uses the shared offline OCR engine;
do not install or download another OCR engine.

## Workflow

1. Reuse the supplied image, existing screenshot, or current browser page.
   Do not open an additional browser tab to obtain the same evidence.
2. Call `superclaw_ocr` with the appropriate source and `chi_sim+eng` unless
   the user requests a different language.
3. Keep the source path and returned text as task evidence. Preserve visible
   line breaks, paths, error codes, and table values where possible.
4. State uncertainty when the image is blurred, cropped, rotated, or the OCR
   confidence is insufficient. Do not invent missing words.
5. Return the recognized text or a concise structured summary, then hand the
   evidence to the requesting workflow or Hermes when applicable.

## Guardrails

- Do not call OCR automatically for every pasted image.
- OCR failure is recoverable: report the failure and continue the main task
  without replacing the user's attachment or interrupting the conversation.
- Do not upload images or OCR text to an external service unless the user has
  explicitly approved that action.
