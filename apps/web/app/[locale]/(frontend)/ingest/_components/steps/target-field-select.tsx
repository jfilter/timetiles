/**
 * Target field select component re-export.
 *
 * The TargetSelect component lives in column-mapping-shared.tsx to avoid
 * circular imports. This module re-exports it under the name requested
 * by the component decomposition plan.
 *
 * @module
 * @category Components
 */
export type { TargetOption } from "./column-mapping-shared";
export { TargetSelect as TargetFieldSelect } from "./column-mapping-shared";
