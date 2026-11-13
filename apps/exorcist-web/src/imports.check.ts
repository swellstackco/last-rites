// Type-check-only smoke file (task 1.4). Deleted in task 4.14 once real code imports the same names.
import { parseReport } from "@graveyard-kit/exorcist-npm/report";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { toGrade } from "@graveyard-kit/skeleton";
import * as graveyard from "@graveyard-kit/skeleton/graveyard";

export const smoke = { parseReport, toGrade, graveyard };
export type SmokeReport = ScanReport;
