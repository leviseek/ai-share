import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type Live2dPetBubblePart = {
  partID: string;
  text: string;
};

export type Live2dPetState = {
  sessionID?: string;
  messageID?: string;
  source: string;
  updatedAt: number;
  text: string;
  parts: Live2dPetBubblePart[];
};

const DEFAULT_STATE: Live2dPetState = {
  source: "",
  updatedAt: 0,
  text: "",
  parts: [],
};

let writeQueue: Promise<void> = Promise.resolve();

export const live2dPetStatePath: string = resolve(
  process.env.USERPROFILE ?? process.env.HOME ?? ".",
  ".config",
  "opencode",
  "live2d-pet-state.json",
);

export async function readLive2dPetState(): Promise<Live2dPetState> {
  try {
    const raw = JSON.parse(await readFile(live2dPetStatePath, "utf8")) as Partial<Live2dPetState>;
    return normalizeState(raw);
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, "code") === "ENOENT") {
      return structuredClone(DEFAULT_STATE);
    }
    return structuredClone(DEFAULT_STATE);
  }
}

export async function publishLive2dPetBubble(input: {
  sessionID?: string;
  messageID?: string;
  partID: string;
  text: string;
  source: string;
  append?: boolean;
}): Promise<Live2dPetState> {
  let next: Live2dPetState | undefined;
  const update = writeQueue.then(async () => {
    const current = await readLive2dPetState();
    next = mergeBubbleState(current, input);
    await persistLive2dPetState(next);
  });
  writeQueue = update.catch(() => undefined);
  await update;
  return next ?? structuredClone(DEFAULT_STATE);
}

export async function persistLive2dPetState(state: Live2dPetState): Promise<void> {
  await mkdir(dirname(live2dPetStatePath), { recursive: true });
  await writeFile(live2dPetStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function mergeBubbleState(
  current: Live2dPetState,
  input: { sessionID?: string; messageID?: string; partID: string; text: string; source: string; append?: boolean },
): Live2dPetState {
  const text = normalizeBubbleText(input.text);
  if (!text) {
    return {
      ...DEFAULT_STATE,
      source: input.source,
      updatedAt: Date.now(),
    };
  }

  const sameMessage = current.messageID === input.messageID && current.sessionID === input.sessionID;
  const parts = sameMessage
    ? mergeParts(current.parts, input.partID, text, Boolean(input.append))
    : [{ partID: input.partID, text }];

  return {
    ...(input.sessionID ? { sessionID: input.sessionID } : {}),
    ...(input.messageID ? { messageID: input.messageID } : {}),
    source: input.source,
    updatedAt: Date.now(),
    text: parts.map((part) => part.text).join(""),
    parts,
  };
}

function mergeParts(
  parts: Live2dPetBubblePart[],
  partID: string,
  text: string,
  append: boolean,
): Live2dPetBubblePart[] {
  const index = parts.findIndex((part) => part.partID === partID);
  if (index >= 0) {
    const next = parts.slice();
    const current = next[index];
    next[index] = { partID, text: append && current ? current.text + text : text };
    return next;
  }
  return [...parts, { partID, text }];
}

function normalizeState(state: Partial<Live2dPetState>): Live2dPetState {
  const parts = Array.isArray(state.parts)
    ? state.parts
        .filter(
          (part): part is Live2dPetBubblePart => typeof part?.partID === "string" && typeof part?.text === "string",
        )
        .map((part) => ({ partID: part.partID, text: normalizeBubbleText(part.text) }))
        .filter((part) => part.text.length > 0)
    : [];

  const text =
    typeof state.text === "string" ? normalizeBubbleText(state.text) : parts.map((part) => part.text).join("");
  return {
    ...(typeof state.sessionID === "string" && state.sessionID ? { sessionID: state.sessionID } : {}),
    ...(typeof state.messageID === "string" && state.messageID ? { messageID: state.messageID } : {}),
    source: typeof state.source === "string" ? state.source : "",
    updatedAt: typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt) ? state.updatedAt : 0,
    text,
    parts,
  };
}

function normalizeBubbleText(text: string): string {
  return text.replaceAll("\r\n", "\n").trim();
}
