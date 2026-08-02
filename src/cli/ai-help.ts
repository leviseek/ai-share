#!/usr/bin/env bun

import { formatInstalledToolDocs, runInstall } from "./ai-install.ts";

const result = await runInstall();
console.log(formatInstalledToolDocs(result));
process.exitCode = result.ok ? 0 : 1;
