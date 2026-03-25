import * as migration_20260321_233540 from './20260321_233540';
import * as migration_20260321_233541_add_sql_functions from './20260321_233541_add_sql_functions';
import * as migration_20260322_034359 from './20260322_034359';
import * as migration_20260322_043744 from './20260322_043744';
import * as migration_20260322_141908 from './20260322_141908';
import * as migration_20260323_023544 from './20260323_023544';
import * as migration_20260324_120000_fix_antimeridian_bounds from './20260324_120000_fix_antimeridian_bounds';
import * as migration_20260325_014023 from './20260325_014023';
import * as migration_20260325_014025_update_sql_functions_for_renamed_column from './20260325_014025_update_sql_functions_for_renamed_column';
import * as migration_20260325_024938 from './20260325_024938';

export const migrations = [
  {
    up: migration_20260321_233540.up,
    down: migration_20260321_233540.down,
    name: '20260321_233540',
  },
  {
    up: migration_20260321_233541_add_sql_functions.up,
    down: migration_20260321_233541_add_sql_functions.down,
    name: '20260321_233541_add_sql_functions',
  },
  {
    up: migration_20260322_034359.up,
    down: migration_20260322_034359.down,
    name: '20260322_034359',
  },
  {
    up: migration_20260322_043744.up,
    down: migration_20260322_043744.down,
    name: '20260322_043744',
  },
  {
    up: migration_20260322_141908.up,
    down: migration_20260322_141908.down,
    name: '20260322_141908',
  },
  {
    up: migration_20260323_023544.up,
    down: migration_20260323_023544.down,
    name: '20260323_023544',
  },
  {
    up: migration_20260324_120000_fix_antimeridian_bounds.up,
    down: migration_20260324_120000_fix_antimeridian_bounds.down,
    name: '20260324_120000_fix_antimeridian_bounds',
  },
  {
    up: migration_20260325_014023.up,
    down: migration_20260325_014023.down,
    name: '20260325_014023',
  },
  {
    up: migration_20260325_014025_update_sql_functions_for_renamed_column.up,
    down: migration_20260325_014025_update_sql_functions_for_renamed_column.down,
    name: '20260325_014025_update_sql_functions_for_renamed_column',
  },
  {
    up: migration_20260325_024938.up,
    down: migration_20260325_024938.down,
    name: '20260325_024938'
  },
];
