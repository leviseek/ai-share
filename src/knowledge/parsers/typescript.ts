import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import ts from "typescript";
import { contentHash, normalizePath, objectId } from "../core/ids.ts";
import type {
  KnowledgeObject,
  KnowledgeRelationship,
  ParseResult,
  ParserContext,
  RepositoryParser,
  RepositoryResource,
} from "../core/types.ts";

export const typescriptParser: RepositoryParser = {
  name: "typescript",
  supports(resource: RepositoryResource): boolean {
    return resource.kind === "file" && /\.tsx?$/.test(resource.path);
  },
  async parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const raw = await readFile(resource.absolutePath, "utf-8");
    const source = ts.createSourceFile(resource.path, raw, ts.ScriptTarget.Latest, true);
    const fileId = objectId(resource.path.endsWith(".test.ts") ? "test" : "codefile", resource.path);
    const objects: KnowledgeObject[] = [
      {
        id: fileId,
        type: resource.path.endsWith(".test.ts") ? "Test" : "CodeFile",
        title: resource.path.split("/").at(-1) ?? resource.path,
        tags: ["typescript"],
        metadata: { lineCount: raw.split(/\r?\n/).length },
        path: resource.path,
        language: "typescript",
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
        metadata: { parser: "typescript" },
      });

    for (const statement of source.statements) {
      collectImport(statement, resource.path, fileId, relationships, context);
      collectSymbol(statement, resource.path, fileId, objects, relationships, context.now);
    }
    return { objects, relationships, diagnostics: [] };
  },
};

function collectImport(
  node: ts.Statement,
  path: string,
  fileId: string,
  relationships: KnowledgeRelationship[],
  context: ParserContext,
): void {
  if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return;
  const moduleSpecifier = node.moduleSpecifier;
  if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) return;
  const specifier = moduleSpecifier.text;
  const resolvedPath = resolveRelativeTypescriptImport(path, specifier, context.repositoryFiles);
  relationships.push({
    from: fileId,
    to: resolvedPath === undefined ? `module:${specifier}` : resolvedImportObjectId(resolvedPath),
    type: "imports",
    metadata: { parser: "typescript", specifier, resolved: resolvedPath !== undefined },
  });
}

function resolveRelativeTypescriptImport(
  path: string,
  specifier: string,
  repositoryFiles: Set<string>,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const baseDir = dirname(path).replaceAll("\\", "/");
  const base = normalizeRelativePath(baseDir === "." ? specifier : `${baseDir}/${specifier}`);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find((candidate) => repositoryFiles.has(candidate));
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

function resolvedImportObjectId(path: string): string {
  if (path.endsWith(".test.ts")) return objectId("test", path);
  if (/\.tsx?$/.test(path)) return objectId("codefile", path);
  if (path.endsWith(".md"))
    return objectId(path.endsWith("AGENTS.md") || path.endsWith("CODEX.md") ? "agent" : "doc", path);
  if (/\.(json|ya?ml)$/.test(path) && !path.endsWith("package.json")) return objectId("config", path);
  return objectId("file", path);
}

function collectSymbol(
  node: ts.Statement,
  path: string,
  fileId: string,
  objects: KnowledgeObject[],
  relationships: KnowledgeRelationship[],
  now: string,
): void {
  const name = declarationName(node);
  if (name === undefined) return;
  const kind = syntaxKindLabel(node);
  const symbolId = objectId("code", path, `${kind}:${name}`);
  objects.push({
    id: symbolId,
    type: "CodeSymbol",
    title: name,
    tags: ["typescript", kind],
    metadata: { kind, exported: hasExportModifier(node) },
    path,
    language: "typescript",
    relationships: [],
    updated_at: now,
    hash: contentHash(`${path}:${kind}:${name}:${node.getStart()}:${node.getEnd()}`),
  });
  relationships.push({ from: fileId, to: symbolId, type: "declares", metadata: { parser: "typescript", kind } });
  if (hasExportModifier(node))
    relationships.push({ from: fileId, to: symbolId, type: "exports", metadata: { parser: "typescript", kind } });
}

function declarationName(node: ts.Statement): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)) &&
    node.name !== undefined
  ) {
    return node.name.text;
  }
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    if (declaration !== undefined && ts.isIdentifier(declaration.name)) return declaration.name.text;
  }
  return undefined;
}

function syntaxKindLabel(node: ts.Statement): string {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isVariableStatement(node)) return "variable";
  return "symbol";
}

function hasExportModifier(node: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
  );
}
