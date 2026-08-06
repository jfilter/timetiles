import { defineConfig } from "tsup";

export default defineConfig({
  // @timetiles/shared is a devDependency bundled into the build: the container's
  // prod-deps stage installs with npm, which cannot resolve workspace: protocols.
  noExternal: ["@timetiles/shared"],
});
