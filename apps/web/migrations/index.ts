import * as migration_20250729_195546 from './20250729_195546';
import * as migration_20250729_195600_add_spatial_functions from './20250729_195600_add_spatial_functions';
import * as migration_20250730_123117 from './20250730_123117';
import * as migration_20250730_131917 from './20250730_131917';
import * as migration_20250731_170928_add_scheduled_imports from './20250731_170928_add_scheduled_imports';
import * as migration_20250819_104526 from './20250819_104526';
import * as migration_20250819_110649 from './20250819_110649';
import * as migration_20250819_135707 from './20250819_135707';
import * as migration_20250820_200736 from './20250820_200736';
import * as migration_20250821_150506_add_soft_delete_fields from './20250821_150506_add_soft_delete_fields';
import * as migration_20250825_185232_add_user_quotas from './20250825_185232_add_user_quotas';
import * as migration_20250826_085916_add_http_cache_field from './20250826_085916_add_http_cache_field';
import * as migration_20251006_164200_add_created_by_fields from './20251006_164200_add_created_by_fields';
import * as migration_20251030_173500_add_catalog_quota_fields from './20251030_173500_add_catalog_quota_fields';
import * as migration_20251104_102735_update_cluster_events_dynamic_radius from './20251104_102735_update_cluster_events_dynamic_radius';
import * as migration_20251104_110000_flexible_histogram_buckets from './20251104_110000_flexible_histogram_buckets';
import * as migration_20251120_231238_add_field_mappings from './20251120_231238_add_field_mappings';
import * as migration_20251120_235510 from './20251120_235510';
import * as migration_20251121_000000_add_gin_index_events_data from './20251121_000000_add_gin_index_events_data';
import * as migration_20251121_154730_field_mapping_overrides from './20251121_154730_field_mapping_overrides';
import * as migration_20251121_160652_remove_geocoding_candidates from './20251121_160652_remove_geocoding_candidates';
import * as migration_20251121_161422_remove_geocoding_progress from './20251121_161422_remove_geocoding_progress';
import * as migration_20251121_190327_detailed_progress_tracking from './20251121_190327_detailed_progress_tracking';
import * as migration_20251123_143904 from './20251123_143904';
import * as migration_20251123_145227 from './20251123_145227';
import * as migration_20251123_152557 from './20251123_152557';
import * as migration_20251123_194846 from './20251123_194846';
import * as migration_20251123_210707 from './20251123_210707';
import * as migration_20251123_222257 from './20251123_222257';
import * as migration_20251123_235627 from './20251123_235627';

export const migrations = [
  {
    up: migration_20250729_195546.up,
    down: migration_20250729_195546.down,
    name: '20250729_195546',
  },
  {
    up: migration_20250729_195600_add_spatial_functions.up,
    down: migration_20250729_195600_add_spatial_functions.down,
    name: '20250729_195600_add_spatial_functions',
  },
  {
    up: migration_20250730_123117.up,
    down: migration_20250730_123117.down,
    name: '20250730_123117',
  },
  {
    up: migration_20250730_131917.up,
    down: migration_20250730_131917.down,
    name: '20250730_131917',
  },
  {
    up: migration_20250731_170928_add_scheduled_imports.up,
    down: migration_20250731_170928_add_scheduled_imports.down,
    name: '20250731_170928_add_scheduled_imports',
  },
  {
    up: migration_20250819_104526.up,
    down: migration_20250819_104526.down,
    name: '20250819_104526',
  },
  {
    up: migration_20250819_110649.up,
    down: migration_20250819_110649.down,
    name: '20250819_110649',
  },
  {
    up: migration_20250819_135707.up,
    down: migration_20250819_135707.down,
    name: '20250819_135707',
  },
  {
    up: migration_20250820_200736.up,
    down: migration_20250820_200736.down,
    name: '20250820_200736',
  },
  {
    up: migration_20250821_150506_add_soft_delete_fields.up,
    down: migration_20250821_150506_add_soft_delete_fields.down,
    name: '20250821_150506_add_soft_delete_fields',
  },
  {
    up: migration_20250825_185232_add_user_quotas.up,
    down: migration_20250825_185232_add_user_quotas.down,
    name: '20250825_185232_add_user_quotas',
  },
  {
    up: migration_20250826_085916_add_http_cache_field.up,
    down: migration_20250826_085916_add_http_cache_field.down,
    name: '20250826_085916_add_http_cache_field',
  },
  {
    up: migration_20251006_164200_add_created_by_fields.up,
    down: migration_20251006_164200_add_created_by_fields.down,
    name: '20251006_164200_add_created_by_fields',
  },
  {
    up: migration_20251030_173500_add_catalog_quota_fields.up,
    down: migration_20251030_173500_add_catalog_quota_fields.down,
    name: '20251030_173500_add_catalog_quota_fields',
  },
  {
    up: migration_20251104_102735_update_cluster_events_dynamic_radius.up,
    down: migration_20251104_102735_update_cluster_events_dynamic_radius.down,
    name: '20251104_102735_update_cluster_events_dynamic_radius',
  },
  {
    up: migration_20251104_110000_flexible_histogram_buckets.up,
    down: migration_20251104_110000_flexible_histogram_buckets.down,
    name: '20251104_110000_flexible_histogram_buckets',
  },
  {
    up: migration_20251120_231238_add_field_mappings.up,
    down: migration_20251120_231238_add_field_mappings.down,
    name: '20251120_231238_add_field_mappings',
  },
  {
    up: migration_20251120_235510.up,
    down: migration_20251120_235510.down,
    name: '20251120_235510',
  },
  {
    up: migration_20251121_000000_add_gin_index_events_data.up,
    down: migration_20251121_000000_add_gin_index_events_data.down,
    name: '20251121_000000_add_gin_index_events_data',
  },
  {
    up: migration_20251121_154730_field_mapping_overrides.up,
    down: migration_20251121_154730_field_mapping_overrides.down,
    name: '20251121_154730_field_mapping_overrides',
  },
  {
    up: migration_20251121_160652_remove_geocoding_candidates.up,
    down: migration_20251121_160652_remove_geocoding_candidates.down,
    name: '20251121_160652_remove_geocoding_candidates',
  },
  {
    up: migration_20251121_161422_remove_geocoding_progress.up,
    down: migration_20251121_161422_remove_geocoding_progress.down,
    name: '20251121_161422_remove_geocoding_progress',
  },
  {
    up: migration_20251121_190327_detailed_progress_tracking.up,
    down: migration_20251121_190327_detailed_progress_tracking.down,
    name: '20251121_190327_detailed_progress_tracking',
  },
  {
    up: migration_20251123_143904.up,
    down: migration_20251123_143904.down,
    name: '20251123_143904',
  },
  {
    up: migration_20251123_145227.up,
    down: migration_20251123_145227.down,
    name: '20251123_145227',
  },
  {
    up: migration_20251123_152557.up,
    down: migration_20251123_152557.down,
    name: '20251123_152557',
  },
  {
    up: migration_20251123_194846.up,
    down: migration_20251123_194846.down,
    name: '20251123_194846',
  },
  {
    up: migration_20251123_210707.up,
    down: migration_20251123_210707.down,
    name: '20251123_210707',
  },
  {
    up: migration_20251123_222257.up,
    down: migration_20251123_222257.down,
    name: '20251123_222257',
  },
  {
    up: migration_20251123_235627.up,
    down: migration_20251123_235627.down,
    name: '20251123_235627'
  },
];
