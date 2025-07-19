import * as migration_20250718_145739 from "./20250718_145739";
import * as migration_20250718_add_events_location_gist from "./20250718_add_events_location_gist";
import * as migration_20250718_225716_add_clustering_function from "./20250718_225716_add_clustering_function";
import * as migration_20250718_225751_add_histogram_function from "./20250718_225751_add_histogram_function";
import * as migration_20250719_update_clustering_distance from "./20250719_update_clustering_distance";
import * as migration_20250719_fix_histogram_function from "./20250719_fix_histogram_function";
import * as migration_20250719_fix_histogram_timezone from "./20250719_fix_histogram_timezone";
import * as migration_20250719_update_histogram_function from "./20250719_update_histogram_function";

export const migrations = [
  {
    up: migration_20250718_145739.up,
    down: migration_20250718_145739.down,
    name: "20250718_145739",
  },
  {
    up: migration_20250718_add_events_location_gist.up,
    down: migration_20250718_add_events_location_gist.down,
    name: "20250718_add_events_location_gist",
  },
  {
    up: migration_20250718_225716_add_clustering_function.up,
    down: migration_20250718_225716_add_clustering_function.down,
    name: "20250718_225716_add_clustering_function",
  },
  {
    up: migration_20250718_225751_add_histogram_function.up,
    down: migration_20250718_225751_add_histogram_function.down,
    name: "20250718_225751_add_histogram_function",
  },
  {
    up: migration_20250719_update_clustering_distance.up,
    down: migration_20250719_update_clustering_distance.down,
    name: "20250719_update_clustering_distance",
  },
  {
    up: migration_20250719_fix_histogram_function.up,
    down: migration_20250719_fix_histogram_function.down,
    name: "20250719_fix_histogram_function",
  },
  {
    up: migration_20250719_fix_histogram_timezone.up,
    down: migration_20250719_fix_histogram_timezone.down,
    name: "20250719_fix_histogram_timezone",
  },
  {
    up: migration_20250719_update_histogram_function.up,
    down: migration_20250719_update_histogram_function.down,
    name: "20250719_update_histogram_function",
  },
];
