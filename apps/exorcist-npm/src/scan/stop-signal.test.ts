import { describe, expect, it } from "vitest";
import { createFakeClock } from "../evidence/test-support/fake-clock.js";
import { createDeadline } from "./stop-signal.js";

describe("createDeadline", () => {
  it("is not aborted before the timeout", () => {
    const fc = createFakeClock();
    const d = createDeadline(fc.clock, 1000);
    expect(d.aborted).toBe(false);
    fc.advance(999);
    expect(d.aborted).toBe(false);
  });

  it("is aborted exactly at the timeout", () => {
    const fc = createFakeClock();
    const d = createDeadline(fc.clock, 1000);
    fc.advance(1000);
    expect(d.aborted).toBe(true);
  });

  it("abort() wins before the timeout", () => {
    const fc = createFakeClock();
    const d = createDeadline(fc.clock, 1000);
    d.abort();
    expect(d.aborted).toBe(true);
  });

  it("reads the clock once at creation and once per aborted read", () => {
    const fc = createFakeClock();
    let reads = 0;
    const d = createDeadline(() => {
      reads++;
      return fc.clock();
    }, 10);
    expect(reads).toBe(1);
    void d.aborted;
    void d.aborted;
    expect(reads).toBe(3);
  });
});
