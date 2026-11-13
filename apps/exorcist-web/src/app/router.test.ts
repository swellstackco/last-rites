import { describe, expect, it } from "vitest";
import { formatRoute, parseRoute, type Route } from "./router.js";

describe("router", () => {
  it("formats each route shape", () => {
    expect(formatRoute({ view: "picker" })).toBe("#/");
    expect(formatRoute({ view: "demo", name: "pump" })).toBe("#/demo/pump");
    expect(formatRoute({ view: "demo", name: "pump", pkg: "a" })).toBe("#/demo/pump?pkg=a");
    expect(formatRoute({ view: "live", repo: "o/r" })).toBe("#/live?repo=o%2Fr");
    expect(formatRoute({ view: "live", repo: "o/r", ref: "v1/x", pkg: "p" })).toBe("#/live?repo=o%2Fr&ref=v1%2Fx&pkg=p");
  });

  it("parses each route shape", () => {
    expect(parseRoute("#/")).toEqual({ view: "picker" });
    expect(parseRoute("#/demo/jest")).toEqual({ view: "demo", name: "jest" });
    expect(parseRoute("#/demo/jest?pkg=left-pad")).toEqual({ view: "demo", name: "jest", pkg: "left-pad" });
    expect(parseRoute("#/live?repo=o%2Fr&ref=main&pkg=x")).toEqual({ view: "live", repo: "o/r", ref: "main", pkg: "x" });
    expect(parseRoute("#/live?repo=o/r")).toEqual({ view: "live", repo: "o/r" });
  });

  it.each([
    "@scope/name",
    "a/b",
    "x#y",
    "100%",
    "a&b=c",
    "what?",
    "with space",
    "emoji 🪦 ünï",
    "a+b",
    "%41",
  ])("round-trips pkg %j", (pkg) => {
    const demo: Route = { view: "demo", name: "pump", pkg };
    expect(parseRoute(formatRoute(demo))).toEqual(demo);
    const live: Route = { view: "live", repo: "o/r", ref: "a/b", pkg };
    expect(parseRoute(formatRoute(live))).toEqual(live);
  });

  it("gives picker for bad percent-escapes, empty and bare hash", () => {
    expect(parseRoute("#/demo/pump?pkg=%E0%A4%A")).toEqual({ view: "picker" });
    expect(parseRoute("")).toEqual({ view: "picker" });
    expect(parseRoute("#")).toEqual({ view: "picker" });
    expect(parseRoute("demo/pump")).toEqual({ view: "picker" });
    expect(parseRoute("#/nope")).toEqual({ view: "picker" });
    expect(parseRoute("#/demo/pump/")).toEqual({ view: "picker" });
  });

  it("gives picker for an upper-case or invalid demo name", () => {
    expect(parseRoute("#/demo/Pump")).toEqual({ view: "picker" });
    expect(parseRoute("#/demo/-x")).toEqual({ view: "picker" });
    expect(parseRoute(`#/demo/${"a".repeat(65)}`)).toEqual({ view: "picker" });
  });

  it("gives picker for a live route without a valid repo or with a bad ref", () => {
    expect(parseRoute("#/live")).toEqual({ view: "picker" });
    expect(parseRoute("#/live?repo=nope")).toEqual({ view: "picker" });
    expect(parseRoute("#/live?repo=o%2Fr&ref=a..b")).toEqual({ view: "picker" });
  });

  it("treats an empty pkg as absent", () => {
    expect(parseRoute("#/demo/pump?pkg=")).toEqual({ view: "demo", name: "pump" });
    expect(formatRoute({ view: "demo", name: "pump", pkg: "" })).toBe("#/demo/pump");
  });
});
