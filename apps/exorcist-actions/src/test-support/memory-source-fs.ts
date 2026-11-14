import type { SourceFs } from "@graveyard-kit/exorcist-npm/programmatic";

type Listing = NonNullable<Awaited<ReturnType<SourceFs["readDir"]>>>;

/**
 * An in-memory SourceFs. `files` maps repository-relative paths to texts; `listing` is what
 * `<root>/.github/workflows` lists (`undefined`: the directory does not exist).
 */
export function memorySourceFs(
  files: Readonly<Record<string, string>>,
  listing: Listing | undefined,
  root = "/repo",
): SourceFs {
  return {
    async readDir(dir) {
      return dir === `${root}/.github/workflows` ? listing : undefined;
    },
    async readText(path) {
      const prefix = `${root}/`;
      return path.startsWith(prefix) ? files[path.slice(prefix.length)] : undefined;
    },
  };
}
