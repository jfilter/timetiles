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
import * as migration_20260326_105027 from './20260326_105027';
import * as migration_20260326_112345 from './20260326_112345';
import * as migration_20260326_113423 from './20260326_113423';
import * as migration_20260326_121310 from './20260326_121310';
import * as migration_20260326_125758 from './20260326_125758';
import * as migration_20260326_163342 from './20260326_163342';
import * as migration_20260326_175611 from './20260326_175611';
import * as migration_20260326_230401 from './20260326_230401';
import * as migration_20260326_233214 from './20260326_233214';
import * as migration_20260327_005403 from './20260327_005403';
import * as migration_20260327_011307 from './20260327_011307';
import * as migration_20260327_014705 from './20260327_014705';
import * as migration_20260329_000000_h3_map_clustering from './20260329_000000_h3_map_clustering';
import * as migration_20260329_202709 from './20260329_202709';
import * as migration_20260329_234544 from './20260329_234544';
import * as migration_20260329_234956 from './20260329_234956';
import * as migration_20260330_003537 from './20260330_003537';
import * as migration_20260331_000000_unique_locations from './20260331_000000_unique_locations';
import * as migration_20260331_200012 from './20260331_200012';
import * as migration_20260331_220208 from './20260331_220208';
import * as migration_20260401_000000_fix_field_filter_null_handling from './20260401_000000_fix_field_filter_null_handling';
import * as migration_20260402_011606 from './20260402_011606';
import * as migration_20260416_092834_unique_dataset_schema_version from './20260416_092834_unique_dataset_schema_version';
import * as migration_20260417_100000_datasets_catalog_name_unique from './20260417_100000_datasets_catalog_name_unique';
import * as migration_20260417_110000_drop_ingest_jobs_dead_fields from './20260417_110000_drop_ingest_jobs_dead_fields';

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
    up: migration_20260326_105027.up,
    down: migration_20260326_105027.down,
    name: '20260326_105027',
  },
  {
    up: migration_20260326_112345.up,
    down: migration_20260326_112345.down,
    name: '20260326_112345',
  },
  {
    up: migration_20260326_113423.up,
    down: migration_20260326_113423.down,
    name: '20260326_113423',
  },
  {
    up: migration_20260326_121310.up,
    down: migration_20260326_121310.down,
    name: '20260326_121310',
  },
  {
    up: migration_20260326_125758.up,
    down: migration_20260326_125758.down,
    name: '20260326_125758',
  },
  {
    up: migration_20260326_163342.up,
    down: migration_20260326_163342.down,
    name: '20260326_163342',
  },
  {
    up: migration_20260326_175611.up,
    down: migration_20260326_175611.down,
    name: '20260326_175611',
  },
  {
    up: migration_20260326_230401.up,
    down: migration_20260326_230401.down,
    name: '20260326_230401',
  },
  {
    up: migration_20260326_233214.up,
    down: migration_20260326_233214.down,
    name: '20260326_233214',
  },
  {
    up: migration_20260327_005403.up,
    down: migration_20260327_005403.down,
    name: '20260327_005403',
  },
  {
    up: migration_20260327_011307.up,
    down: migration_20260327_011307.down,
    name: '20260327_011307',
  },
  {
    up: migration_20260327_014705.up,
    down: migration_20260327_014705.down,
    name: '20260327_014705',
  },
  {
    up: migration_20260329_000000_h3_map_clustering.up,
    down: migration_20260329_000000_h3_map_clustering.down,
    name: '20260329_000000_h3_map_clustering',
  },
  {
    up: migration_20260329_202709.up,
    down: migration_20260329_202709.down,
    name: '20260329_202709',
  },
  {
    up: migration_20260329_234544.up,
    down: migration_20260329_234544.down,
    name: '20260329_234544',
  },
  {
    up: migration_20260329_234956.up,
    down: migration_20260329_234956.down,
    name: '20260329_234956',
  },
  {
    up: migration_20260330_003537.up,
    down: migration_20260330_003537.down,
    name: '20260330_003537',
  },
  {
    up: migration_20260331_000000_unique_locations.up,
    down: migration_20260331_000000_unique_locations.down,
    name: '20260331_000000_unique_locations',
  },
  {
    up: migration_20260331_200012.up,
    down: migration_20260331_200012.down,
    name: '20260331_200012',
  },
  {
    up: migration_20260331_220208.up,
    down: migration_20260331_220208.down,
    name: '20260331_220208',
  },
  {
    up: migration_20260401_000000_fix_field_filter_null_handling.up,
    down: migration_20260401_000000_fix_field_filter_null_handling.down,
    name: '20260401_000000_fix_field_filter_null_handling',
  },
  {
    up: migration_20260402_011606.up,
    down: migration_20260402_011606.down,
    name: '20260402_011606'
  },
  {
    up: migration_20260416_092834_unique_dataset_schema_version.up,
    down: migration_20260416_092834_unique_dataset_schema_version.down,
    name: '20260416_092834_unique_dataset_schema_version',
  },
  {
    up: migration_20260417_100000_datasets_catalog_name_unique.up,
    down: migration_20260417_100000_datasets_catalog_name_unique.down,
    name: '20260417_100000_datasets_catalog_name_unique',
  },
  {
    up: migration_20260417_110000_drop_ingest_jobs_dead_fields.up,
    down: migration_20260417_110000_drop_ingest_jobs_dead_fields.down,
    name: '20260417_110000_drop_ingest_jobs_dead_fields',
  },
];
