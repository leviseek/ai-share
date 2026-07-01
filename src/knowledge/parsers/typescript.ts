import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import ts from "typescript";
import { contentHash, objectId } from "../core/ids.ts";
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
      collectImport(statement, fileId, relationships);
      collectSymbol(statement, resource.path, fileId, objects, relationships, context.now);
    }
    return { objects, relationships, diagnostics: [] };
  },
};

function collectImport(node: ts.Statement, fileId: string, relationships: KnowledgeRelationship[]): void {
  if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return;
  const moduleSpecifier = node.moduleSpecifier;
  if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) return;
  relationships.push({
    from: fileId,
    to: `module:${moduleSpecifier.text}`,
    type: "imports",
    metadata: { parser: "typescript", specifier: moduleSpecifier.text },
  });
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
