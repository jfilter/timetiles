// @vitest-environment node
/**
 * Verify workspace test selection and cache inputs against the real task graph.
 * @module
 * @category Tests
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const cwd = resolve(process.cwd(), "../..");
const run = (command: string, args: string[]) => execFileSync(command, args, { cwd, encoding: "utf8", timeout: 15000 });
interface Task {
  taskId: string;
  command: string;
  inputs: Record<string, string>;
}

describe("workspace test coverage", () => {
  it.each(["test", "test:coverage"])("includes Makefile in %s cache inputs", (taskName) => {
    const graph = JSON.parse(run("pnpm", ["turbo", "run", taskName, "--filter=web", "--dry=json"])) as {
      tasks: Task[];
    };
    const task = graph.tasks.find((entry) => entry.taskId === `web#${taskName}`)!;
    expect(Object.keys(task.inputs)).toContain("../../Makefile");
  });

  it("includes UI tests in the full make test-ai task graph", () => {
    const recipe = run("make", ["-n", "test-ai", "FILTER="]);
    const selection = /pnpm turbo run test:ai([^;\n]*)/.exec(recipe);
    expect(selection).not.toBeNull();
    const args = selection![1]!.trim().split(/\s+/).filter(Boolean);
    const graph = JSON.parse(run("pnpm", ["turbo", "run", "test:ai", ...args, "--dry=json"])) as { tasks: Task[] };
    const tasks = graph.tasks.filter((task) => task.command !== "<NONEXISTENT>");
    expect(tasks.map((task) => task.taskId)).toEqual(
      expect.arrayContaining(["web#test:ai", "timescrape#test:ai", "@timetiles/ui#test:ai"])
    );
    expect(Object.keys(tasks.find((task) => task.taskId === "web#test:ai")!.inputs)).toContain("../../Makefile");
  });
});
