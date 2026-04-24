#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const officialSchemaUrl = "https://opencode.ai/config.json";
const outputPath = resolve(import.meta.dir, "..", ".vscode", "opencode.schema.json");

const officialSchema = await fetchOfficialSchema();
const schema = createWorkspaceSchema(officialSchema);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`);

console.log(`Updated ${outputPath}`);
console.log(`Source: ${officialSchemaUrl}`);

async function fetchOfficialSchema(): Promise<unknown> {
  const response = await fetch(officialSchemaUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${officialSchemaUrl}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function createWorkspaceSchema(officialSchema: unknown): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "OpenCode Workspace Config",
    description:
      "Workspace-local OpenCode schema generated from the official schema, with custom providers and models allowed for VS Code.",
    "x-ai-share-source": officialSchemaUrl,
    "x-ai-share-official-title": getStringProperty(officialSchema, "title"),
    type: "object",
    additionalProperties: true,
    properties: {
      $schema: {
        type: "string",
      },
      model: {
        $ref: "#/$defs/modelRef",
      },
      small_model: {
        $ref: "#/$defs/modelRef",
      },
      instructions: {
        type: "array",
        items: {
          type: "string",
        },
      },
      provider: {
        type: "object",
        additionalProperties: {
          $ref: "#/$defs/provider",
        },
      },
    },
    $defs: {
      modelRef: {
        type: "string",
        pattern: "^[^/]+/.+$",
        description: "OpenCode model reference in provider/model format. Custom providers like codexapis are allowed.",
      },
      provider: {
        type: "object",
        additionalProperties: true,
        properties: {
          name: {
            type: "string",
          },
          npm: {
            type: "string",
          },
          options: {
            type: "object",
            additionalProperties: true,
            properties: {
              baseURL: {
                type: "string",
              },
              apiKey: {
                type: "string",
              },
              timeout: {
                type: ["number", "boolean"],
              },
              chunkTimeout: {
                type: "number",
              },
            },
          },
          models: {
            type: "object",
            additionalProperties: {
              $ref: "#/$defs/model",
            },
          },
        },
      },
      model: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
          options: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
  };
}

function getStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const property = value[key as keyof typeof value];
  return typeof property === "string" ? property : undefined;
}
