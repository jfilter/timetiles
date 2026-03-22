import * as migration_20260321_233540 from './20260321_233540';
import * as migration_20260321_233541_add_sql_functions from './20260321_233541_add_sql_functions';

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
]
