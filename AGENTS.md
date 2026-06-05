# AGENTS.md

## Cursor Cloud specific instructions

This repository ("moovie") is currently an empty project stub for a movie streaming application. It contains only a `README.md` file with no source code, dependencies, or services.

### Current State

- No package manager or dependency files exist (`package.json`, `requirements.txt`, `go.mod`, etc.)
- No build system configured (`Makefile`, `Dockerfile`, `docker-compose.yml`)
- No services to start or test
- No lint, test, or build commands available

### Environment Verification

The Cloud VM provides baseline tooling (git, Node.js via nvm, Python 3). To confirm the environment is ready:

```bash
git status
node --version
python3 --version
```

### When Code Is Added

Future agents should check for:

- `package.json` (Node.js/JS/TS) → use the lockfile's package manager (`npm install`, `pnpm install`, or `yarn install`)
- `requirements.txt` or `pyproject.toml` (Python) → `pip install -r requirements.txt` or `uv sync`
- `Dockerfile` or `docker-compose.yml` → containerized services
- `Makefile` → check for `setup`, `dev`, `lint`, and `test` targets

Update the VM environment update script and this section once the tech stack is established.
