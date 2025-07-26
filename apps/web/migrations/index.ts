import { down, up } from "./20250718_145739";
import {
  down as migration_20250718_225716_add_clustering_function_down,
  up as migration_20250718_225716_add_clustering_function_up,
} from "./20250718_225716_add_clustering_function";
import {
  down as migration_20250718_225751_add_histogram_function_down,
  up as migration_20250718_225751_add_histogram_function_up,
} from "./20250718_225751_add_histogram_function";
import {
  down as migration_20250718_add_events_location_gist_down,
  up as migration_20250718_add_events_location_gist_up,
} from "./20250718_add_events_location_gist";
import {
  down as migration_20250719_fix_histogram_function_down,
  up as migration_20250719_fix_histogram_function_up,
} from "./20250719_fix_histogram_function";
import {
  down as migration_20250719_fix_histogram_timezone_down,
  up as migration_20250719_fix_histogram_timezone_up,
} from "./20250719_fix_histogram_timezone";
import {
  down as migration_20250719_update_clustering_distance_down,
  up as migration_20250719_update_clustering_distance_up,
} from "./20250719_update_clustering_distance";
import {
  down as migration_20250719_update_histogram_function_down,
  up as migration_20250719_update_histogram_function_up,
} from "./20250719_update_histogram_function";
import {
  down as migration_20250723_195307_force_fix_histogram_down,
  up as migration_20250723_195307_force_fix_histogram_up,
} from "./20250723_195307_force_fix_histogram";
import {
  down as migration_20250723_200030_fix_cluster_events_missing_fields_down,
  up as migration_20250723_200030_fix_cluster_events_missing_fields_up,
} from "./20250723_200030_fix_cluster_events_missing_fields";
import {
  down as migration_20250723_200530_fix_cluster_distance_zoom16_down,
  up as migration_20250723_200530_fix_cluster_distance_zoom16_up,
} from "./20250723_200530_fix_cluster_distance_zoom16";

export const migrations = [
  {
    up: up,
    down: down,
    name: "20250718_145739",
  },
  {
    up: migration_20250718_add_events_location_gist_up,
    down: migration_20250718_add_events_location_gist_down,
    name: "20250718_add_events_location_gist",
  },
  {
    up: migration_20250718_225716_add_clustering_function_up,
    down: migration_20250718_225716_add_clustering_function_down,
    name: "20250718_225716_add_clustering_function",
  },
  {
    up: migration_20250718_225751_add_histogram_function_up,
    down: migration_20250718_225751_add_histogram_function_down,
    name: "20250718_225751_add_histogram_function",
  },
  {
    up: migration_20250719_update_clustering_distance_up,
    down: migration_20250719_update_clustering_distance_down,
    name: "20250719_update_clustering_distance",
  },
  {
    up: migration_20250719_fix_histogram_function_up,
    down: migration_20250719_fix_histogram_function_down,
    name: "20250719_fix_histogram_function",
  },
  {
    up: migration_20250719_fix_histogram_timezone_up,
    down: migration_20250719_fix_histogram_timezone_down,
    name: "20250719_fix_histogram_timezone",
  },
  {
    up: migration_20250719_update_histogram_function_up,
    down: migration_20250719_update_histogram_function_down,
    name: "20250719_update_histogram_function",
  },
  {
    up: migration_20250723_195307_force_fix_histogram_up,
    down: migration_20250723_195307_force_fix_histogram_down,
    name: "20250723_195307_force_fix_histogram",
  },
  {
    up: migration_20250723_200030_fix_cluster_events_missing_fields_up,
    down: migration_20250723_200030_fix_cluster_events_missing_fields_down,
    name: "20250723_200030_fix_cluster_events_missing_fields",
  },
  {
    up: migration_20250723_200530_fix_cluster_distance_zoom16_up,
    down: migration_20250723_200530_fix_cluster_distance_zoom16_down,
    name: "20250723_200530_fix_cluster_distance_zoom16",
  },
];
