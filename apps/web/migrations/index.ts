import * as migration_20250729_195546 from "./20250729_195546";
import * as migration_20250729_195600_add_spatial_functions from "./20250729_195600_add_spatial_functions";
import * as migration_20250730_123117 from "./20250730_123117";
import * as migration_20250730_131917 from "./20250730_131917";
import * as migration_20250731_170928_add_scheduled_imports from "./20250731_170928_add_scheduled_imports";
import * as migration_20250819_104526 from "./20250819_104526";
import * as migration_20250819_110649 from "./20250819_110649";
import * as migration_20250819_135707 from "./20250819_135707";
import * as migration_20250820_200736 from "./20250820_200736";
import * as migration_20250821_150506_add_soft_delete_fields from "./20250821_150506_add_soft_delete_fields";
import * as migration_20250825_185232_add_user_quotas from "./20250825_185232_add_user_quotas";
import * as migration_20250826_085916_add_http_cache_field from "./20250826_085916_add_http_cache_field";

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
  {
    up: migration_20250731_170928_add_scheduled_imports.up,
    down: migration_20250731_170928_add_scheduled_imports.down,
    name: "20250731_170928_add_scheduled_imports",
  },
  {
    up: migration_20250819_104526.up,
    down: migration_20250819_104526.down,
    name: "20250819_104526",
  },
  {
    up: migration_20250819_110649.up,
    down: migration_20250819_110649.down,
    name: "20250819_110649",
  },
  {
    up: migration_20250819_135707.up,
    down: migration_20250819_135707.down,
    name: "20250819_135707",
  },
  {
    up: migration_20250820_200736.up,
    down: migration_20250820_200736.down,
    name: "20250820_200736",
  },
  {
    up: migration_20250821_150506_add_soft_delete_fields.up,
    down: migration_20250821_150506_add_soft_delete_fields.down,
    name: "20250821_150506_add_soft_delete_fields",
  },
  {
    up: migration_20250825_185232_add_user_quotas.up,
    down: migration_20250825_185232_add_user_quotas.down,
    name: "20250825_185232_add_user_quotas",
  },
  {
    up: migration_20250826_085916_add_http_cache_field.up,
    down: migration_20250826_085916_add_http_cache_field.down,
    name: "20250826_085916_add_http_cache_field",
  },
];
