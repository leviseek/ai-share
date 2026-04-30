declare module "*.html" {
  const content: unknown;
  export default content;
}

declare module "*.css" {
  const content: string;
  export default content;
}
