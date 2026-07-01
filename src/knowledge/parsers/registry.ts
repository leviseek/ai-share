import type { ParseResult, ParserContext, RepositoryParser, RepositoryResource } from "../core/types.ts";

export class ParserRegistry {
  private readonly parsers: RepositoryParser[];

  constructor(parsers: RepositoryParser[]) {
    this.parsers = parsers;
  }

  async parse(resource: RepositoryResource, context: ParserContext): Promise<ParseResult> {
    const selected = this.parsers.filter((parser) => parser.supports(resource));
    const results = await Promise.all(selected.map((parser) => parser.parse(resource, context)));
    return {
      objects: results.flatMap((result) => result.objects),
      relationships: results.flatMap((result) => result.relationships),
      diagnostics: results.flatMap((result) => result.diagnostics),
    };
  }
}
