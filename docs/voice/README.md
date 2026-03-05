# Voice messages

Voice messages are transcribed locally using [Whisper](https://github.com/openai/whisper) via the `nodejs-whisper` package. No audio is sent to external services.

## Configuration

Transcription is configured under `globals.transcription` and can be overridden per project in the `projects` map (e.g. `projects.my-bot.transcription`). Set these in your config file (e.g. `hal.config.yaml` or `hal.config.local.yaml`).

| Key | Description | Default |
|-----|-------------|---------|
| `model` | Whisper model name (see [Whisper models](#whisper-models) below). | `"base.en"` |
| `showTranscription` | If `true`, the bot sends the transcribed text as a message before the engine reply. | `true` |

Example — global defaults:

```yaml
globals:
  transcription:
    model: base.en
    showTranscription: true
```

Example — override for one project (e.g. use a larger model and hide transcription):

```yaml
projects:
  backend:
    cwd: ./backend
    telegram:
      botToken: "${BACKEND_BOT_TOKEN}"
    transcription:
      model: small
      showTranscription: false
```

For where these keys sit in the full config (globals table, projects table), see [Configuration](../config/README.md).

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
