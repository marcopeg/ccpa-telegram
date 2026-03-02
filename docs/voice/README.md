# Voice messages

Voice messages are transcribed locally using [Whisper](https://github.com/openai/whisper) via the `nodejs-whisper` package. No audio is sent to external services.

## Setup

1. **ffmpeg** — for audio conversion
   ```bash
   brew install ffmpeg         # macOS
   sudo apt install ffmpeg     # Ubuntu/Debian
   ```

2. **CMake** — for building the Whisper executable
   ```bash
   brew install cmake          # macOS
   sudo apt install cmake      # Ubuntu/Debian
   ```

3. **Download and build Whisper** — run once after installation:
   ```bash
   npx nodejs-whisper download
   ```

## Whisper models

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| `tiny` | ~75 MB | Fastest | Basic |
| `tiny.en` | ~75 MB | Fastest | English-only |
| `base` | ~142 MB | Fast | Good |
| `base.en` | ~142 MB | Fast | English-only (default) |
| `small` | ~466 MB | Medium | Good multilingual |
| `medium` | ~1.5 GB | Slower | Very good multilingual |
| `large-v3-turbo` | ~1.5 GB | Fast | Near-large quality |
