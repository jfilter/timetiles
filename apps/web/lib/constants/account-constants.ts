/**
 * Account lifecycle constants.
 *
 * Client-safe constants for account management features (deletion, etc.).
 * Values are loaded from `config/timetiles.yml` with hardcoded defaults.
 *
 * @module
 * @category Constants
 */
import { getAppConfig } from "@/lib/config/app-config";

/** Grace period in days before account is permanently deleted. */
export const DELETION_GRACE_PERIOD_DAYS = getAppConfig().account.deletionGracePeriodDays;
