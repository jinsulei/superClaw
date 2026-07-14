---
name: superclaw-video-analysis
description: Analyze user-authorized video with bundled ffmpeg, ffprobe, OCR, and transcription tools while preserving evidence.
---

# SuperClaw Video Analysis Workflow

Use this skill for a local video file, a user-provided recording, or an
approved public video URL. The goal is evidence-based analysis, not merely a
generic description.

## Workflow

1. Confirm the source, requested outcome, and whether local processing or an
   approved public URL is in scope. Reuse the current browser/page for a URL.
2. Inspect media metadata with the bundled `ffprobe`, then extract only the
   necessary frames or short clips with the bundled `ffmpeg`.
3. Use `superclaw_ocr` for text visible in selected frames. Use the bundled
   transcription tool when speech is relevant and a local audio track exists.
4. Record evidence with timestamps, frame paths, OCR text, transcript snippets,
   and tool errors. Keep temporary files inside the workspace and clean them
   after reporting unless the user asks to retain an artifact.
5. Return a concise result with findings, timestamps, artifacts, limitations,
   and the next safe action.

## Guardrails

- Do not create additional browser tabs or contexts for automated browsing.
- Do not publish, upload, download from a restricted source, or redistribute
  material without the user's explicit confirmation.
- Do not claim a frame, transcript, or OCR result exists unless a native tool
  returned it. If a tool is unavailable, report the concrete blocker.
