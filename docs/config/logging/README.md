# Logging

Logging can be set globally in `globals.logging` and overridden per project in the `projects` map (e.g. `projects.<key>.logging`).

## Options

| Key | Description | Default |
|-----|-------------|---------|
| `level` | Log level: `debug`, `info`, `warn`, `error` | `"info"` |
| `flow` | Write logs to terminal (stdout) | `true` |
| `persist` | Write logs to file | `false` |

Example:

```yaml
globals:
  logging:
    level: info
    flow: true
    persist: false
projects:
  backend:
    cwd: ./backend
    telegram:
      botToken: "${BACKEND_BOT_TOKEN}"
    logging:
      persist: true
```

Here **backend** overrides the global default and enables log persistence for that project only.

## Log files

When `logging.persist` is `true` (globally or for a project), logs are written to:

```
{config-dir}/.hal/logs/{project-slug}/YYYY-MM-DD.txt
```

Files are created daily. The directory structure is described in [Configuration](../README.md#directory-structure).

[← Back to Configuration](../README.md)
