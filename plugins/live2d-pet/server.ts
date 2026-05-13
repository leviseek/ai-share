import { publishLive2dPetBubble } from "./tui/state.ts";

type Plugin = {
  id: string;
  server(): Promise<
    Record<string, (input: Record<string, unknown>, output?: Record<string, unknown>) => Promise<void>>
  >;
};

const assistantMessageIDs = new Set<string>();

const plugin: Plugin = {
  id: "live2d-pet",
  server: async () => ({
    "message.updated": async (input) => {
      const properties = recordValue(input, "properties");
      const info = recordValue(input, "info") ?? recordValue(properties, "info");
      const messageID = stringValue(input.messageID) ?? stringValue(properties?.messageID) ?? stringValue(info?.id);
      const role = stringValue(input.role) ?? stringValue(properties?.role) ?? stringValue(info?.role);
      if (!messageID) return;
      if (role === "assistant") {
        assistantMessageIDs.add(messageID);
      } else if (role === "user") {
        assistantMessageIDs.delete(messageID);
      }
    },
    "experimental.text.complete": async (input, output) => {
      const sessionID = stringValue(input.sessionID);
      const messageID = stringValue(input.messageID);
      const partID = stringValue(input.partID);
      const text = normalizeBubbleText(stringValue(output?.text));
      if (!partID || !text) return;
      await publishLive2dPetBubble({
        ...(sessionID ? { sessionID } : {}),
        ...(messageID ? { messageID } : {}),
        partID,
        text,
        source: "experimental.text.complete",
      });
    },
    "message.part.updated": async (input, output) => {
      const properties = recordValue(input, "properties");
      const part = recordValue(input, "part") ?? recordValue(properties, "part");
      const sessionID =
        stringValue(input.sessionID) ?? stringValue(properties?.sessionID) ?? stringValue(part?.sessionID);
      const messageID =
        stringValue(input.messageID) ?? stringValue(properties?.messageID) ?? stringValue(part?.messageID);
      const partID = stringValue(input.partID) ?? stringValue(properties?.partID) ?? stringValue(part?.id);
      const text = normalizeBubbleText(stringValue(part?.text) ?? stringValue(output?.text));
      if (messageID && !assistantMessageIDs.has(messageID)) return;
      if (!partID || !text) return;
      await publishLive2dPetBubble({
        ...(sessionID ? { sessionID } : {}),
        ...(messageID ? { messageID } : {}),
        partID,
        text,
        source: "message.part.updated",
      });
    },
    "message.part.delta": async (input, output) => {
      const properties = recordValue(input, "properties");
      const part = recordValue(input, "part") ?? recordValue(properties, "part");
      const delta = recordValue(input, "delta") ?? recordValue(properties, "delta") ?? recordValue(part, "delta");
      const sessionID =
        stringValue(input.sessionID) ?? stringValue(properties?.sessionID) ?? stringValue(part?.sessionID);
      const messageID =
        stringValue(input.messageID) ?? stringValue(properties?.messageID) ?? stringValue(part?.messageID);
      const partID = stringValue(input.partID) ?? stringValue(properties?.partID) ?? stringValue(part?.id);
      const text = normalizeBubbleText(
        stringValue(delta?.text) ??
          stringValue(input.text) ??
          stringValue(properties?.text) ??
          stringValue(output?.text),
      );
      if (messageID && !assistantMessageIDs.has(messageID)) return;
      if (!partID || !text) return;
      await publishLive2dPetBubble({
        ...(sessionID ? { sessionID } : {}),
        ...(messageID ? { messageID } : {}),
        partID,
        text,
        source: "message.part.delta",
        append: true,
      });
    },
  }),
};

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordValue(value: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const property = value[key];
  return property && typeof property === "object" && !Array.isArray(property)
    ? (property as Record<string, unknown>)
    : undefined;
}

function normalizeBubbleText(text: string | undefined): string {
  return text ? text.replaceAll("\r\n", "\n").trim() : "";
}

export default plugin;
