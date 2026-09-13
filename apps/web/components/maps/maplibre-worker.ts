/**
 * Points MapLibre at its served worker before the first map is created.
 *
 * @module
 * @category Components
 */
"use client";

import { setWorkerUrl } from "maplibre-gl";

import { MAPLIBRE_WORKER_URL } from "@/lib/constants/map";

setWorkerUrl(MAPLIBRE_WORKER_URL);
