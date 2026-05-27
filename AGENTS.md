# AGENTS.md

## Cursor Cloud specific instructions

This repository ("moovie") is currently an empty project stub for a movie streaming application. It contains only a `README.md` file with no source code, dependencies, or services.

### Current State

- No package manager or dependency files exist
- No build system configured
- No services to start or test
- No lint, test, or build commands available

### When Code Is Added

Future agents should check for:
- A `package.json` (Node.js/JS/TS project) → use `npm install` / `pnpm install` / `yarn install`
- A `requirements.txt` or `pyproject.toml` (Python project) → use `pip install` / `uv sync`
- A `Dockerfile` or `docker-compose.yml` → containerized services
- A `Makefile` → check for setup/dev targets

Update the VM environment script and this file once the tech stack is established.
