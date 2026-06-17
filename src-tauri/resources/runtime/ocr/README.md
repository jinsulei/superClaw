# Shared OCR Runtime

This runtime is shared by OpenClaw, Hermes, and ClaudeCode.

It runs locally with Node.js and `tesseract.js`; it does not call online OCR
APIs and does not depend on a system `tesseract.exe`.

Commands:

```powershell
node src-tauri/resources/runtime/ocr/ocr-runner.cjs --health
node src-tauri/resources/runtime/ocr/ocr-runner.cjs --image C:\tmp\ocr-test.png --lang eng+chi_sim --json
```

The runner also accepts stdin JSON:

```json
{"imagePath":"C:\\tmp\\ocr-test.png","lang":"eng+chi_sim","agent":"openclaw"}
```
