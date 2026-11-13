// Entry point: build the real dependencies and mount the controller.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/graveyard.css";
import "./styles/detail.css";
import { createApiClient } from "./api/client.js";
import { createController } from "./app/controller.js";

const appRoot = document.getElementById("app-root");
const dialogRoot = document.getElementById("dialog-root");

if (appRoot && dialogRoot) {
  const controller = createController({
    api: createApiClient({
      fetch: (input, init) => globalThis.fetch(input, init),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    }),
    io: {
      getHash: () => location.hash,
      setHash: (hash) => {
        location.hash = hash;
      },
      replaceHash: (hash) => {
        history.replaceState(null, "", hash);
      },
      back: () => history.back(),
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    clock: { now: () => performance.now() },
    appRoot,
    dialogRoot,
    document,
  });
  window.addEventListener("hashchange", () => controller.onHashChange());
  controller.start();
}
