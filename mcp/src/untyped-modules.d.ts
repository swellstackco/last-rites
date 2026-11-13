// The two pinned Oracles ship no types; the server only passes them through as `unknown`.
declare module "intersect";
declare module "deep-diff";
declare module "intersect/package.json" {
  const manifest: { version: string };
  export default manifest;
}
declare module "deep-diff/package.json" {
  const manifest: { version: string };
  export default manifest;
}
