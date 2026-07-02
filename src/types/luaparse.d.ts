declare module "luaparse" {
  export function parse(input: string, options?: Record<string, unknown>): unknown;

  const luaparse: {
    parse: typeof parse;
  };

  export default luaparse;
}
