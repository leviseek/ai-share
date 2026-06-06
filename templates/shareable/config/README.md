# Shareable Config Template

This directory contains minimal shareable examples for bootstrapping another `ai-share` environment.

It is not consumed by the generator directly. The active source remains `config/*.yaml`.

`env.yaml` may include non-secret runtime defaults such as local proxy variables. Do not place API keys, tokens, cookies, passwords, or private local paths in template env files.
