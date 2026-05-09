import templateAsset from "./template.html" with { type: "text" };
import stylesCss from "./styles.css" with { type: "text" };
import { clientScript } from "./client-script.ts";

export function renderHtml(): string {
  return String(templateAsset)
    .replace("<!-- LIVE2D_PET_STYLES -->", stylesCss)
    .replace("<!-- LIVE2D_PET_SCRIPT -->", clientScript);
}
