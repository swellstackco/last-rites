import { deepDiffRecipe } from "./deep-diff.js";
import { intersectRecipe } from "./intersect.js";
import { nodeAbortControllerRecipe } from "./node-abort-controller.js";
import type { AppRecipe } from "./types.js";

/** The recipes of the three hero packages, keyed by package name. */
export const RECIPES: Readonly<Record<string, AppRecipe>> = {
  intersect: intersectRecipe,
  "deep-diff": deepDiffRecipe,
  "node-abort-controller": nodeAbortControllerRecipe,
};

export type { AppRecipe } from "./types.js";
