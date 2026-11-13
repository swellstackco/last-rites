import type { Recipe } from "@graveyard-kit/skeleton/proof/runner";

/** A skeleton Recipe plus the npm-specific Oracle loader. */
export type AppRecipe = Recipe & {
  loadOracle?(): { module: unknown; version: string } | undefined;
};
