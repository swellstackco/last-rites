import type { Recipe } from "@last-rites/skeleton/proof/runner";

/** A skeleton Recipe plus the npm-specific Oracle loader. */
export type AppRecipe = Recipe & {
  loadOracle?(): { module: unknown; version: string } | undefined;
};
