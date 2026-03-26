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
import * as migration_20260325_104859 from './20260325_104859';
import * as migration_20260325_135037 from './20260325_135037';
import * as migration_20260325_215337 from './20260325_215337';
import * as migration_20260325_225411 from './20260325_225411';
import * as migration_20260325_235725 from './20260325_235725';
import * as migration_20260326_000000_adaptive_cluster_radius from './20260326_000000_adaptive_cluster_radius';
import * as migration_20260326_000001_cluster_zoom_refinement from './20260326_000001_cluster_zoom_refinement';
import * as migration_20260327_000000_cluster_zoom_refinement_v2 from './20260327_000000_cluster_zoom_refinement_v2';
import * as migration_20260327_000001_cluster_extent from './20260327_000001_cluster_extent';
import * as migration_20260327_000002_drop_adaptive_scaling from './20260327_000002_drop_adaptive_scaling';

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
    name: '20260325_024938',
  },
  {
    up: migration_20260325_104859.up,
    down: migration_20260325_104859.down,
    name: '20260325_104859',
  },
  {
    up: migration_20260325_135037.up,
    down: migration_20260325_135037.down,
    name: '20260325_135037',
  },
  {
    up: migration_20260325_215337.up,
    down: migration_20260325_215337.down,
    name: '20260325_215337',
  },
  {
    up: migration_20260325_225411.up,
    down: migration_20260325_225411.down,
    name: '20260325_225411',
  },
  {
    up: migration_20260325_235725.up,
    down: migration_20260325_235725.down,
    name: '20260325_235725',
  },
  {
    up: migration_20260326_000000_adaptive_cluster_radius.up,
    down: migration_20260326_000000_adaptive_cluster_radius.down,
    name: '20260326_000000_adaptive_cluster_radius'
  },
  {
    up: migration_20260326_000001_cluster_zoom_refinement.up,
    down: migration_20260326_000001_cluster_zoom_refinement.down,
    name: '20260326_000001_cluster_zoom_refinement',
  },
  {
    up: migration_20260327_000000_cluster_zoom_refinement_v2.up,
    down: migration_20260327_000000_cluster_zoom_refinement_v2.down,
    name: '20260327_000000_cluster_zoom_refinement_v2',
  },
  {
    up: migration_20260327_000001_cluster_extent.up,
    down: migration_20260327_000001_cluster_extent.down,
    name: '20260327_000001_cluster_extent',
  },
  {
    up: migration_20260327_000002_drop_adaptive_scaling.up,
    down: migration_20260327_000002_drop_adaptive_scaling.down,
    name: '20260327_000002_drop_adaptive_scaling',
  },
];
