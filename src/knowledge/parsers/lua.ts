import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import luaparse from "luaparse";
import { contentHash, normalizePath, objectId } from "../core/ids.ts";
import type {
  KnowledgeObject,
  KnowledgeRelationship,
  ParseResult,
  ParserContext,
  RepositoryParser,
  RepositoryResource,
} from "../core/types.ts";

export const luaParser: RepositoryParser = {
  name: "lua",
  supports(resource: RepositoryResource): boolean {
    return resource.kind === "file" && resource.path.endsWith(".lua");
  },
  async parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const raw = await readFile(resource.absolutePath, "utf-8");
    const ast = luaparse.parse(raw, { locations: true, ranges: true, luaVersion: "5.3" });
    const fileId = objectId("codefile", resource.path);
    const objects: KnowledgeObject[] = [
      {
        id: fileId,
        type: "CodeFile",
        title: resource.path.split("/").at(-1) ?? resource.path,
        tags: ["lua"],
        metadata: { lineCount: raw.split(/\r?\n/).length },
        path: resource.path,
        language: "lua",
        relationships: [],
        updated_at: context.now,
        hash: resource.hash ?? contentHash(raw),
      },
    ];
    const relationships: KnowledgeRelationship[] = [];
    const parent = dirname(resource.path).replaceAll("\\", "/");
    if (parent !== ".")
      relationships.push({
        from: objectId("dir", parent),
        to: fileId,
        type: "contains",
        metadata: { parser: "lua" },
      });

    visitAst(ast, (node) => {
      collectLuaSymbol(node, resource.path, fileId, objects, relationships, context.now);
      collectLuaRequire(node, resource.path, fileId, relationships, context);
    });
    return { objects, relationships, diagnostics: [] };
  },
};

function collectLuaSymbol(
  node: Record<string, unknown>,
  path: string,
  fileId: string,
  objects: KnowledgeObject[],
  relationships: KnowledgeRelationship[],
  now: string,
): void {
  if (node.type !== "FunctionDeclaration") return;
  const identifier = recordValue(node.identifier);
  const name = identifier === undefined ? undefined : luaIdentifierName(identifier);
  if (name === undefined) return;
  const kind = "function";
  const isLocal = node.isLocal === true;
  const range = numberArrayValue(node.range);
  const loc = recordValue(node.loc);
  const symbolId = objectId("code", path, `${kind}:${name}`);
  objects.push({
    id: symbolId,
    type: "CodeSymbol",
    title: name,
    tags: ["lua", kind],
    metadata: {
      kind,
      exported: !isLocal,
      ...(locLine(loc, "start") === undefined ? {} : { lineStart: locLine(loc, "start") }),
      ...(locLine(loc, "end") === undefined ? {} : { lineEnd: locLine(loc, "end") }),
    },
    path,
    language: "lua",
    relationships: [],
    updated_at: now,
    hash: contentHash(`${path}:${kind}:${name}:${range?.join(":") ?? ""}`),
  });
  relationships.push({ from: fileId, to: symbolId, type: "declares", metadata: { parser: "lua", kind } });
  if (!isLocal) relationships.push({ from: fileId, to: symbolId, type: "exports", metadata: { parser: "lua", kind } });
}

function collectLuaRequire(
  node: Record<string, unknown>,
  path: string,
  fileId: string,
  relationships: KnowledgeRelationship[],
  context: ParserContext,
): void {
  if (node.type !== "CallExpression") return;
  const base = recordValue(node.base);
  if (base?.type !== "Identifier" || base.name !== "require") return;
  const args = arrayValue(node.arguments);
  const specifier = args === undefined ? undefined : luaStringLiteralValue(args[0]);
  if (specifier === undefined) return;
  const resolvedPath = resolveLuaRequire(path, specifier, context.repositoryFiles);
  relationships.push({
    from: fileId,
    to: resolvedPath === undefined ? `module:${specifier}` : objectId("codefile", resolvedPath),
    type: "imports",
    metadata: { parser: "lua", specifier, resolved: resolvedPath !== undefined },
  });
}

function resolveLuaRequire(path: string, specifier: string, repositoryFiles: Set<string>): string | undefined {
  const modulePath = normalizeRelativeLuaModule(specifier);
  if (modulePath.length === 0) return undefined;
  const baseDir = dirname(path).replaceAll("\\", "/");
  const scopedBase = baseDir === "." ? modulePath : `${baseDir}/${modulePath}`;
  const candidates = [`${scopedBase}.lua`, `${scopedBase}/init.lua`, `${modulePath}.lua`, `${modulePath}/init.lua`].map(
    normalizeRelativePath,
  );
  return candidates.find((candidate) => repositoryFiles.has(candidate));
}

function normalizeRelativeLuaModule(specifier: string): string {
  return normalizePath(specifier.replaceAll(".", "/").replace(/^\/+/, ""));
}

function normalizeRelativePath(path: string): string {
  const parts: string[] = [];
  for (const part of normalizePath(path).split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function visitAst(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitAst(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  for (const child of Object.values(value)) visitAst(child, visit);
}

function luaIdentifierName(identifier: Record<string, unknown>): string | undefined {
  if (identifier.type === "Identifier") return stringValue(identifier.name);
  if (identifier.type === "MemberExpression" || identifier.type === "IndexExpression") {
    const base = recordValue(identifier.base);
    const member = recordValue(identifier.identifier) ?? recordValue(identifier.index);
    const baseName = base === undefined ? undefined : luaIdentifierName(base);
    const memberName = member === undefined ? undefined : (luaIdentifierName(member) ?? luaStringLiteralValue(member));
    if (baseName !== undefined && memberName !== undefined) return `${baseName}.${memberName}`;
  }
  return undefined;
}

function luaStringLiteralValue(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== "StringLiteral") return undefined;
  const raw = stringValue(value.raw);
  if (raw === undefined || raw.length < 2) return stringValue(value.value);
  return raw.slice(1, -1);
}

function locLine(loc: Record<string, unknown> | undefined, key: "start" | "end"): number | undefined {
  const point = recordValue(loc?.[key]);
  const line = point?.line;
  return typeof line === "number" ? line : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function numberArrayValue(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((item): item is number => typeof item === "number") ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
