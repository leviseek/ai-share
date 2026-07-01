# config/env.yaml Schema

## Overview

Codex `.env` source for non-secret runtime environment variables. The generator writes these values to `CODEX_HOME/.env`, preserving an existing file unless `--force` is used.

## Fields

| Field              | Type   | Required | Description                                   |
| ------------------ | ------ | -------- | --------------------------------------------- |
| `variables`        | object | no       | Environment variables written to Codex `.env` |
| `variables.<name>` | string | yes      | Non-empty value for one Codex runtime env var |

## Rules

- Use this file for non-secret runtime variables such as local proxy settings.
- Do not put API keys, tokens, cookies, passwords, private keys, or bearer credentials here.
- Do not put `CODEX_HOME`, `HOME`, `USERPROFILE`, `PATH`, `AI_SHARE_*`, or `CODEX_*` here; those are system, generator, or generator-managed variables.
- If `CODEX_HOME/.env` already exists, `bun run ai:gen` preserves it. Use `bun run ai:gen -- --force` to regenerate it from `config/env.yaml`.

## Current Variables

| Variable      | Purpose                        |
| ------------- | ------------------------------ |
| `HTTP_PROXY`  | Uppercase HTTP proxy           |
| `HTTPS_PROXY` | Uppercase HTTPS proxy          |
| `ALL_PROXY`   | Uppercase SOCKS/all proxy      |
| `NO_PROXY`    | Uppercase local bypass list    |
| `http_proxy`  | Lowercase HTTP proxy fallback  |
| `https_proxy` | Lowercase HTTPS proxy fallback |
| `all_proxy`   | Lowercase SOCKS/all proxy      |
| `no_proxy`    | Lowercase local bypass list    |
