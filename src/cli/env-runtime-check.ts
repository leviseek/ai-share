import { createConnection } from "node:net";
import type { EnvYaml } from "../types.ts";

export type LocalProxyTarget = {
  host: string;
  port: number;
  envNames: string[];
};

export type LocalProxyRuntimeCheck = LocalProxyTarget & {
  ok: boolean;
};

export type LocalProxyCheckSummary = {
  ok: boolean;
  summary: string;
};

type TcpProbe = (host: string, port: number, timeoutMs: number) => Promise<boolean>;

const PROXY_ENV_NAMES = new Set(["http_proxy", "https_proxy", "all_proxy"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export async function checkOpenCodeEnvLocalProxies(
  envConfig: EnvYaml,
  probe: TcpProbe = tcpConnect,
  timeoutMs = 800,
): Promise<LocalProxyRuntimeCheck[]> {
  const targets = collectLocalProxyTargets(envConfig);
  return Promise.all(
    targets.map(async (target) => ({
      ...target,
      ok: await probe(target.host, target.port, timeoutMs),
    })),
  );
}

export function collectLocalProxyTargets(envConfig: EnvYaml): LocalProxyTarget[] {
  const variables = envConfig.variables;
  const targets = new Map<string, LocalProxyTarget>();

  for (const [envName, envValue] of Object.entries(variables)) {
    if (!PROXY_ENV_NAMES.has(envName.toLowerCase())) continue;

    const target = parseLocalProxyTarget(envValue);
    if (!target) continue;

    const key = `${target.host}:${target.port}`;
    const existing = targets.get(key);
    if (existing) {
      existing.envNames.push(envName);
    } else {
      targets.set(key, { ...target, envNames: [envName] });
    }
  }

  return [...targets.values()];
}

export function summarizeLocalProxyChecks(checks: readonly LocalProxyRuntimeCheck[]): LocalProxyCheckSummary {
  if (checks.length === 0) return { ok: true, summary: "未配置本地代理。" };

  const unreachable = checks.filter((check) => !check.ok);
  if (unreachable.length > 0) {
    return { ok: false, summary: `本地代理不可达：${formatProxyTargets(unreachable)}。` };
  }
  return { ok: true, summary: `本地代理可达：${formatProxyTargets(checks)}。` };
}

function parseLocalProxyTarget(value: string): Omit<LocalProxyTarget, "envNames"> | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (!LOOPBACK_HOSTS.has(url.hostname)) return undefined;

  const port = url.port ? Number(url.port) : defaultProxyPort(url.protocol);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return undefined;

  return { host: url.hostname, port };
}

function defaultProxyPort(protocol: string): number {
  if (protocol === "https:") return 443;
  if (protocol === "socks:" || protocol === "socks4:" || protocol === "socks5:") return 1080;
  return 80;
}

function formatProxyTargets(targets: readonly LocalProxyTarget[]): string {
  return targets.map((target) => `${target.host}:${target.port}`).join("、");
}

function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
