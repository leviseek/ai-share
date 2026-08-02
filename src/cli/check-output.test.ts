import { expect, test } from "bun:test";
import { renderCheckReport, type CheckReport } from "./check-output.ts";

test("check report uses the AI Check title", () => {
  const report = {
    status: "ok",
    online: false,
    canary: false,
    elapsed_ms: 12,
    checks: [],
  } satisfies CheckReport;

  const output = renderCheckReport(report, "codexapis", false);

  expect(output).toContain("AI Check");
  expect(output).not.toContain("AI Doctor");
});
