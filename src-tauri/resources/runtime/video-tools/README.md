# SuperClaw Video Toolchain

This directory contains bundled portable video tools for the desktop package.

Bundled tools:

- `yt-dlp/yt-dlp.exe`
  - Source: https://github.com/yt-dlp/yt-dlp/releases
  - Version tested in this branch: `2026.06.09`
- `ffmpeg/bin/ffmpeg.exe`
- `ffmpeg/bin/ffprobe.exe`
  - Source: https://www.gyan.dev/ffmpeg/builds/
  - Build family: FFmpeg release essentials for Windows
- `whisper.cpp/whisper-cli.exe`
- `whisper.cpp/models/ggml-tiny.bin`
  - Binary source: https://github.com/ggml-org/whisper.cpp/releases
  - Model source: https://huggingface.co/ggerganov/whisper.cpp

Runtime code should prefer these bundled paths over system `PATH`, Python-installed launchers, or developer-machine tools.

Important limits:

- Bundled `yt-dlp` does not guarantee Douyin, Xiaohongshu, Kuaishou, or other social/video links can be parsed. Some platforms require fresh cookies, login state, or are blocked by anti-bot checks.
- Bundled `ffmpeg` and `ffprobe` provide local media processing after media is available.
- Bundled `whisper.cpp` and the tiny model provide a base ASR runtime after audio is available.
- A complete product workflow still needs downloader orchestration, cookie/login policy, subtitle extraction handling, audio extraction, ASR invocation, and frame OCR if frame text is required.
