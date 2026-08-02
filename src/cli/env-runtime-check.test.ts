import { describe, expect, test } from "bun:test";
import {
  checkOpenCodeEnvLocalProxies,
  collectLocalProxyTargets,
  summarizeLocalProxyChecks,
} from "./env-runtime-check.ts";

describe("OpenCode launcher env runtime checks", () => {
  test("deduplicates loopback proxy targets from uppercase and lowercase env names", () => {
    expect(
      collectLocalProxyTargets({
        variables: {
          HTTP_PROXY: "http://127.0.0.1:7897",
          http_proxy: "http://127.0.0.1:7897",
          HTTPS_PROXY: "http://localhost:7897",
          NO_PROXY: "localhost,127.0.0.1",
          REMOTE_PROXY: "http://proxy.example.test:7890",
        },
      }),
    ).toEqual([
      {
        host: "127.0.0.1",
        port: 7897,
        envNames: ["HTTP_PROXY", "http_proxy"],
      },
      {
        host: "localhost",
        port: 7897,
        envNames: ["HTTPS_PROXY"],
      },
    ]);
  });

  test("reports probe status without touching the real network when a probe is supplied", async () => {
    const checks = await checkOpenCodeEnvLocalProxies(
      {
        variables: {
          ALL_PROXY: "socks5://127.0.0.1:7897",
        },
      },
      () => Promise.resolve(false),
      1,
    );

    expect(checks).toEqual([
      {
        host: "127.0.0.1",
        port: 7897,
        envNames: ["ALL_PROXY"],
        ok: false,
      },
    ]);
  });

  test("reports whether configured local proxy endpoints are reachable", () => {
    expect(summarizeLocalProxyChecks([])).toEqual({ ok: true, summary: "未配置本地代理。" });
    expect(summarizeLocalProxyChecks([{ host: "127.0.0.1", port: 7897, envNames: ["HTTP_PROXY"], ok: true }])).toEqual({
      ok: true,
      summary: "本地代理可达：127.0.0.1:7897。",
    });
    expect(summarizeLocalProxyChecks([{ host: "127.0.0.1", port: 7897, envNames: ["HTTP_PROXY"], ok: false }])).toEqual(
      { ok: false, summary: "本地代理不可达：127.0.0.1:7897。" },
    );
  });
});
