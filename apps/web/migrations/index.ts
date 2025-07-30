import * as migration_20250729_195546 from "./20250729_195546";
import * as migration_20250729_195600_add_spatial_functions from "./20250729_195600_add_spatial_functions";
import * as migration_20250730_123117 from "./20250730_123117";
import * as migration_20250730_131917 from "./20250730_131917";

export const migrations = [
  {
    up: migration_20250729_195546.up,
    down: migration_20250729_195546.down,
    name: "20250729_195546",
  },
  {
    up: migration_20250729_195600_add_spatial_functions.up,
    down: migration_20250729_195600_add_spatial_functions.down,
    name: "20250729_195600_add_spatial_functions",
  },
  {
    up: migration_20250730_123117.up,
    down: migration_20250730_123117.down,
    name: "20250730_123117",
  },
  {
    up: migration_20250730_131917.up,
    down: migration_20250730_131917.down,
    name: "20250730_131917",
  },
];
