import type { ParseResult, ParserContext, RepositoryParser, RepositoryResource } from "../core/types.ts";

export class ParserRegistry {
  private readonly parsers: RepositoryParser[];

  constructor(parsers: RepositoryParser[]) {
    this.parsers = parsers;
  }

  async parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const selected = this.parsers.filter((parser) => parser.supports(resource));
    const results = await Promise.all(selected.map((parser) => safeParse(parser, resource, context)));
    return {
      objects: results.flatMap((result) => result.objects),
      relationships: results.flatMap((result) => result.relationships),
      diagnostics: results.flatMap((result) => result.diagnostics),
    };
  }
}

async function safeParse(
  parser: RepositoryParser,
  resource: RepositoryResource,
  context: ParserContext,
): Promise<ParseResult> {
  try {
    return await parser.parse(resource, context);
  } catch (error) {
    return {
      objects: [],
      relationships: [],
      diagnostics: [
        {
          parser: parser.name,
          path: resource.path,
          severity: "error",
          message: error instanceof Error ? error.message : "Parse failed.",
        },
      ],
    };
  }
}
