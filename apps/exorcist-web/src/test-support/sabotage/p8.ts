import type { Sabotage } from "@graveyard-kit/skeleton/graveyard/testing";
import { KNOWN_ERROR_CODES, describeError } from "../../api/errors.js";
import type { UiError } from "../../api/errors.js";
import type { DescribeErrorFn } from "../properties/p8.js";

const real = describeError;

function bodyCode(body: unknown): unknown {
  return (body as { error?: { code?: unknown } } | null | undefined)?.error?.code;
}
function bodyMessage(body: unknown): unknown {
  return (body as { error?: { message?: unknown } } | null | undefined)?.error?.message;
}

const throwsOnUnknownCode: DescribeErrorFn = (input) => {
  const code = bodyCode(input.body);
  if (typeof code === "string" && !(KNOWN_ERROR_CODES as readonly string[]).includes(code)) {
    throw new Error(`unknown error code ${code}`);
  }
  return real(input);
};

const emptyDetailForUnknown: DescribeErrorFn = (input) => {
  const e = real(input);
  return e.code === "unknown_error" ? { ...e, detail: "" } : e;
};

function withSeconds(f: (e: UiError, header: unknown) => number | undefined): DescribeErrorFn {
  return (input) => {
    const e = real(input);
    if (e.code !== "rate_limited") return e;
    const { retryAfterSeconds: _drop, ...rest } = e;
    const n = f(e, input.retryAfterHeader);
    return n === undefined ? rest : { ...rest, retryAfterSeconds: n };
  };
}

const unclamped = withSeconds((e, h) => {
  const n = typeof h === "string" && /^\s*\d+\s*$/.test(h) ? Number(h) : NaN;
  return n > 0 ? n : e.retryAfterSeconds;
});
const negative = withSeconds(() => -1);
const notANumber = withSeconds(() => Number.NaN);
const missingHeaderUndefined = withSeconds((e, h) => (typeof h === "string" && /^\s*[1-9]\d*\s*$/.test(h) ? e.retryAfterSeconds : undefined));

const messageNotTruncated: DescribeErrorFn = (input) => {
  const e = real(input);
  const m = bodyMessage(input.body);
  return typeof m === "string" && m !== "" && e.serverMessage !== undefined ? { ...e, serverMessage: m } : e;
};

export const P8_SABOTAGES: readonly Sabotage<DescribeErrorFn>[] = [
  { name: "throws on an unknown code", impl: throwsOnUnknownCode },
  { name: "empty detail for unknown codes", impl: emptyDetailForUnknown },
  { name: "unclamped retryAfterSeconds", impl: unclamped },
  { name: "negative retryAfterSeconds", impl: negative },
  { name: "NaN retryAfterSeconds", impl: notANumber },
  { name: "server message not truncated", impl: messageNotTruncated },
  { name: "429 without a header gives undefined", impl: missingHeaderUndefined },
];
