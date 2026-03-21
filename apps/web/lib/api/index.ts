/**
 * Unified API framework for custom route handlers.
 *
 * @module
 * @category API
 */
export {
  canManageResource,
  requireAdmin,
  requireDefaultSite,
  requireFeatureEnabled,
  requireOwnerOrAdmin,
  requirePrivileged,
  requireScrapersEnabled,
} from "./auth-helpers";
export {
  AppError,
  ConflictError,
  type ErrorResponse,
  ForbiddenError,
  handleError,
  NotFoundError,
  safeFindByID,
  ValidationError,
} from "./errors";
export { apiRoute } from "./handler";
export { fetchJson, HttpError } from "./http-error";
