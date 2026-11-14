// Starts the scan API and Vite together. Run with: vite-node scripts/dev.ts (npm run dev).
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

interface Job {
  label: string;
  command: string;
  args: string[];
}

const JOBS: Job[] = [
  { label: "api", command: "npm", args: ["run", "serve", "-w", "@last-rites/exorcist-npm"] },
  { label: "web", command: "npx", args: ["vite"] },
];

const children: ChildProcess[] = [];
let exitCode = 0;
let stopping = false;
let running = JOBS.length;

function stopAll(signal: NodeJS.Signals): void {
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill(signal);
}

function prefix(label: string, stream: NodeJS.ReadableStream | null, out: NodeJS.WriteStream): void {
  if (!stream) return;
  createInterface({ input: stream }).on("line", (line) => out.write(`[${label}] ${line}\n`));
}

for (const job of JOBS) {
  const child = spawn(job.command, job.args, { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  prefix(job.label, child.stdout, process.stdout);
  prefix(job.label, child.stderr, process.stderr);
  child.on("error", (err) => {
    process.stderr.write(`[${job.label}] failed to start: ${err.message}\n`);
    exitCode = exitCode || 1;
    stopAll("SIGTERM");
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null && !stopping) exitCode = code;
    else if (code === null && !stopping) exitCode = exitCode || 1;
    running -= 1;
    if (!stopping) stopAll("SIGTERM");
    if (running === 0) process.exit(exitCode);
  });
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));

console.log("Last Rites: http://127.0.0.1:5173/");
