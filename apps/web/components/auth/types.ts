/**
 * Shared types for authentication form components.
 *
 * @module
 * @category Components
 */

/** Status states for auth forms that include a success state (register, forgot-password, reset-password). */
export type FormStatus = "idle" | "loading" | "success" | "error";

/** Status states for the login form (no success state — redirects on success). */
export type LoginFormStatus = "idle" | "loading" | "error";
