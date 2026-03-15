/**
 * Unified API framework for custom route handlers.
 *
 * @module
 * @category API
 */
export { apiSuccess } from "../utils/api-response";
export {
  AppError,
  ConflictError,
  ForbiddenError,
  handleError,
  NotFoundError,
  safeFindByID,
  ValidationError,
} from "./errors";
export { apiRoute } from "./handler";
export { fetchJson, HttpError } from "./http-error";
