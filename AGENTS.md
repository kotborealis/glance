# Agent guidance

Glance is a Go application with server-rendered HTML and embedded frontend assets.

## Changes

- Follow the Go version and existing conventions in `go.mod`; format Go code with `gofmt`.
- Keep dependencies minimal and prefer the existing helpers and vanilla JavaScript/CSS patterns.
- For configuration changes, update `docs/configuration.md` and add focused tests under `internal/glance`.
- Frontend source lives under `internal/glance/static`; HTML templates live under `internal/glance/templates`.

## Verification

- Run `go test ./...` for Go changes and build the application to an output path outside the repository.
- Run `git diff --check` before committing.
- For JavaScript changes, run an available syntax check on the changed files.

## Safety

- Never commit credentials, local instance configuration, generated binaries, or environment-specific service URLs.
- Commit or push changes only when explicitly requested by the maintainer.
