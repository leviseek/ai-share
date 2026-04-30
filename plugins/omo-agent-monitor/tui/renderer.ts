import templateAsset from "./template.html" with { type: "text" };
import stylesCss from "./styles.css" with { type: "text" };
import { clientScript } from "./client-script.ts";

export function renderHtml(): string {
  const templateHtml = String(templateAsset);
  return templateHtml
    .replace("<!-- OMO_MONITOR_STYLES -->", stylesCss)
    .replace("<!-- OMO_MONITOR_SCRIPT -->", clientScript);
}
