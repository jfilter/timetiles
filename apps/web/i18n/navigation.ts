/**
 * Locale-aware navigation primitives.
 *
 * Use these instead of next/link and next/navigation in frontend components.
 * They automatically handle locale prefixing in URLs.
 *
 * @module
 * @category Configuration
 */

import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
