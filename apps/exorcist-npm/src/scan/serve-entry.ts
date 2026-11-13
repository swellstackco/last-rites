// Process entry for `npm run serve`. vite-node strips the script path from
// process.argv, so server.ts cannot detect being the entry point itself.
import { main } from "./server.js";

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
