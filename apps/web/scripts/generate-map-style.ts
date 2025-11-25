#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Generates custom MapLibre styles with cartographic design system colors.
 *
 * Fetches the VersaTiles colorful style as a base and applies color
 * transformations to align with the TimeTiles cartographic palette.
 * Generates both light and dark mode variants.
 *
 * @module
 * @category Scripts
 */
import fs from "node:fs";
import path from "node:path";

// Cartographic color palette (from packages/ui/src/lib/chart-themes.ts)
const cartographicColors = {
  parchment: "#f8f5f0", // oklch(0.96 0.01 80)
  charcoal: "#404040", // oklch(0.25 0 0)
  navy: "#4a5568", // oklch(0.35 0.06 250)
  blue: "#0089a7", // oklch(0.58 0.11 220)
  terracotta: "#cd853f", // oklch(0.56 0.14 35)
  forest: "#5f9e6e", // oklch(0.42 0.08 145)
  cream: "#e8e4dd", // oklch(0.88 0.01 80)
};

// Dark mode base colors
const darkModeColors = {
  background: "#1a1a1a", // Very dark gray
  backgroundLight: "#252525", // Slightly lighter for contrast
  backgroundMedium: "#2d2d2d", // Medium dark
  surface: "#333333", // Surface elements
  surfaceLight: "#3d3d3d", // Lighter surface
  muted: "#4a4a4a", // Muted elements
};

interface MapColorPalette {
  land: string;
  water: string;
  waterDark: string;
  forest: string;
  parkLight: string;
  parkMedium: string;
  building: string;
  buildingStroke: string;
  roadMajor: string;
  roadMinor: string;
  roadSecondary: string;
  roadOutline: string;
  textPrimary: string;
  textSecondary: string;
  textHalo: string;
  boundary: string;
  rail: string;
  sand: string;
  industrial: string;
  commercial: string;
  agriculture: string;
}

// Light mode color palette
const lightMapColors: MapColorPalette = {
  land: cartographicColors.parchment,
  water: "#b8dce8", // Light blue tint
  waterDark: "#9fd0e0", // Slightly darker for rivers
  forest: cartographicColors.forest,
  parkLight: "#c5ddc8",
  parkMedium: "#a8d1ae",
  building: cartographicColors.cream,
  buildingStroke: "#d4cfc7",
  roadMajor: cartographicColors.cream,
  roadMinor: "#ffffff",
  roadSecondary: "#f0ebe4",
  roadOutline: "#d4cfc7",
  textPrimary: cartographicColors.charcoal,
  textSecondary: cartographicColors.navy,
  textHalo: cartographicColors.parchment,
  boundary: "#c4b9a8",
  rail: "#b3b3b3",
  sand: "#f0e8d8",
  industrial: cartographicColors.cream,
  commercial: "#f0ebe4",
  agriculture: "#e8e4d0",
};

// Dark mode color palette
const darkMapColors: MapColorPalette = {
  land: darkModeColors.background,
  water: "#1a3a4a", // Dark blue tint (derived from cartographic blue)
  waterDark: "#153040", // Darker blue for rivers
  forest: "#2d4a35", // Muted dark forest green
  parkLight: "#2a3d2e",
  parkMedium: "#253528",
  building: darkModeColors.backgroundMedium,
  buildingStroke: darkModeColors.surface,
  roadMajor: darkModeColors.surfaceLight,
  roadMinor: darkModeColors.surface,
  roadSecondary: darkModeColors.backgroundMedium,
  roadOutline: darkModeColors.muted,
  textPrimary: "#ffffff", // Pure white for crisp readable text
  textSecondary: "#c0c0c0", // Light gray for secondary text
  textHalo: "#000000", // Black halo for contrast
  boundary: darkModeColors.muted,
  rail: "#5a5a5a",
  sand: "#3d3528", // Dark warm tone
  industrial: "#28282540", // Very dark with transparency
  commercial: "#2a252540", // Very dark with transparency
  agriculture: "#2a282040", // Dark muted yellow-brown with transparency
};

/**
 * Creates a color replacement map for a given palette.
 */
const createColorReplacements = (colors: MapColorPalette): Record<string, string> => ({
  // ===== BACKGROUND/LAND =====
  "rgb(249,244,238)": colors.land,
  "rgba(249,244,238,1)": colors.land,

  // ===== WATER =====
  "rgb(190,221,243)": colors.water,
  "rgba(190,221,243,1)": colors.water,
  "rgb(170,211,239)": colors.waterDark,

  // ===== VEGETATION =====
  "rgb(102,170,68)": colors.forest,
  "rgba(102,170,68,1)": colors.forest,
  "rgb(102,170,68,0.5)": `${colors.forest}80`,
  "rgb(207,230,164)": colors.parkLight,
  "rgba(207,230,164,1)": colors.parkLight,
  "rgb(178,221,128)": colors.parkMedium,
  "rgba(178,221,128,1)": colors.parkMedium,
  "rgb(187,230,169)": colors.parkLight,
  "rgba(187,230,169,1)": colors.parkLight,
  "rgb(230,230,180)": colors.agriculture,
  "rgba(230,230,180,1)": colors.agriculture,

  // ===== BUILDINGS =====
  "rgb(242,234,226)": colors.building,
  "rgba(242,234,226,1)": colors.building,
  "rgb(226,219,211)": colors.buildingStroke,
  "rgba(226,219,211,1)": colors.buildingStroke,

  // ===== ROADS =====
  "rgb(255,204,136)": colors.roadMajor,
  "rgba(255,204,136,1)": colors.roadMajor,
  "rgb(242,177,102)": colors.roadMajor,
  "rgb(255,238,170)": colors.roadSecondary,
  "rgba(255,238,170,1)": colors.roadSecondary,
  "rgb(255,230,153)": colors.roadSecondary,
  "rgba(255,230,153,1)": colors.roadSecondary,
  "rgb(255,247,204)": colors.roadSecondary,
  "rgba(255,247,204,1)": colors.roadSecondary,
  "rgb(255,255,255)": colors.roadMinor,
  "rgba(255,255,255,1)": colors.roadMinor,
  "rgb(187,170,136)": colors.roadOutline,
  "rgba(187,170,136,1)": colors.roadOutline,
  "rgb(204,187,153)": colors.roadOutline,
  "rgba(204,187,153,1)": colors.roadOutline,
  "rgb(170,153,119)": colors.roadOutline,
  "rgba(170,153,119,1)": colors.roadOutline,

  // ===== TEXT =====
  "rgb(51,51,51)": colors.textPrimary,
  "rgba(51,51,51,1)": colors.textPrimary,
  "rgb(0,0,0)": colors.textPrimary,
  "rgba(0,0,0,1)": colors.textPrimary,
  "rgb(102,102,102)": colors.textSecondary,
  "rgba(102,102,102,1)": colors.textSecondary,
  "rgb(119,119,119)": colors.textSecondary,
  "rgba(119,119,119,1)": colors.textSecondary,
  "#ffffff": colors.textHalo,
  "#fff": colors.textHalo,
  // Additional text color variants found in VersaTiles
  "rgb(51,51,68)": colors.textPrimary, // Dark blue-gray text
  "rgba(51,51,68,1)": colors.textPrimary,
  "rgb(85,85,85)": colors.textSecondary, // Medium gray text
  "rgba(85,85,85,1)": colors.textSecondary,
  "rgb(102,98,106)": colors.textSecondary, // Gray-purple text
  "rgba(102,98,106,1)": colors.textSecondary,
  "rgb(40,48,73)": colors.textPrimary, // Very dark blue text
  "rgba(40,48,73,1)": colors.textPrimary,
  "rgb(61,61,77)": colors.textPrimary, // Dark blue-gray
  "rgba(61,61,77,1)": colors.textPrimary,
  "rgb(40,67,73)": colors.textPrimary, // Dark teal
  "rgba(40,67,73,1)": colors.textPrimary,
  "rgb(40,62,73)": colors.textPrimary,
  "rgba(40,62,73,1)": colors.textPrimary,
  "rgb(40,57,73)": colors.textPrimary,
  "rgba(40,57,73,1)": colors.textPrimary,
  "rgb(169,164,158)": colors.textSecondary, // Light gray text (keep visible)
  "rgba(169,164,158,1)": colors.textSecondary,

  // ===== BOUNDARIES =====
  "rgb(153,136,119)": colors.boundary,
  "rgba(153,136,119,1)": colors.boundary,
  "rgb(170,153,136)": colors.boundary,
  "rgba(170,153,136,1)": colors.boundary,

  // ===== RAIL =====
  "rgb(170,170,170)": colors.rail,
  "rgba(170,170,170,1)": colors.rail,
  "rgb(153,153,153)": colors.rail,
  "rgba(153,153,153,1)": colors.rail,

  // ===== MISC =====
  "rgb(245,235,204)": colors.sand,
  "rgba(245,235,204,1)": colors.sand,
  "rgb(230,220,209)": colors.industrial,
  "rgba(230,220,209,1)": colors.industrial,
  "rgb(248,236,212)": colors.commercial,
  "rgba(248,236,212,1)": colors.commercial,

  // ===== LAND USE (with alpha - important for dark mode) =====
  // Commercial/retail areas
  "rgba(247,222,237,0.251)": colors.commercial,
  // Industrial/quarry/railway areas
  "rgba(255,244,194,0.333)": colors.industrial,
  // Residential areas
  "rgba(234,230,225,0.2)": colors.commercial, // Use commercial color for residential
  // Agriculture/farmland
  "rgb(240,231,209)": colors.agriculture,
  "rgba(240,231,209,1)": colors.agriculture,

  // ===== ADDITIONAL BUILDING/LAND FILLS (found in VersaTiles style) =====
  "rgb(244,239,233)": colors.building, // Building fill variant
  "rgba(244,239,233,1)": colors.building,
  "rgb(249,245,239)": colors.building, // Building fill variant
  "rgba(249,245,239,1)": colors.building,
  "rgb(235,232,230)": colors.building, // Building fill variant
  "rgba(235,232,230,1)": colors.building,

  // ===== LIGHT GRAYS (roads, pedestrian, surfaces) =====
  "rgb(247,247,247)": colors.roadMinor, // Very light gray
  "rgba(247,247,247,1)": colors.roadMinor,
  "rgb(222,222,222)": colors.roadMinor, // Light gray
  "rgba(222,222,222,1)": colors.roadMinor,
  "rgb(217,217,217)": colors.roadMinor, // Light gray
  "rgba(217,217,217,1)": colors.roadMinor,
  "rgb(207,205,202)": colors.buildingStroke, // Gray surface
  "rgba(207,205,202,1)": colors.buildingStroke,
  "rgb(221,220,218)": colors.buildingStroke, // Gray surface
  "rgba(221,220,218,1)": colors.buildingStroke,

  // ===== BRIGHT YELLOWS (retail, commercial, beach) =====
  "rgb(255,240,179)": colors.sand, // Beach/sand areas
  "rgba(255,240,179,1)": colors.sand,
  "rgb(255,255,128)": colors.commercial, // Retail/commercial
  "rgba(255,255,128,1)": colors.commercial,
  "rgb(217,217,165)": colors.agriculture, // Farmland variant
  "rgba(217,217,165,1)": colors.agriculture,
  "rgb(255,209,148)": colors.commercial, // Commercial variant
  "rgba(255,209,148,1)": colors.commercial,

  // ===== LIGHT BLUES (glacier, ice) =====
  "rgb(239,249,255)": colors.water, // Very light blue (glacier/ice)
  "rgba(239,249,255,1)": colors.water,

  // ===== PINKS/PURPLES (special areas) =====
  "rgb(251,235,255)": colors.commercial, // Light pink (special commercial)
  "rgba(251,235,255,1)": colors.commercial,
  "rgb(226,212,230)": colors.commercial, // Light purple (special areas)
  "rgba(226,212,230,1)": colors.commercial,

  // ===== ADDITIONAL PARKS/VEGETATION (bright greens found in VersaTiles) =====
  "rgb(216,232,200)": colors.parkLight, // Light green park
  "rgba(216,232,200,1)": colors.parkLight,
  "rgb(211,230,219)": colors.parkLight, // Light green/cyan park
  "rgba(211,230,219,1)": colors.parkLight,
  "rgb(231,237,222)": colors.parkLight, // Very light green park
  "rgba(231,237,222,1)": colors.parkLight,

  // ===== REMAINING BRIGHT SURFACES =====
  "rgb(250,250,237)": colors.building, // Very light cream
  "rgba(250,250,237,1)": colors.building,
  "rgb(250,245,240)": colors.building, // Very light cream
  "rgba(250,245,240,1)": colors.building,
  "rgb(243,235,227)": colors.building, // Light cream
  "rgba(243,235,227,1)": colors.building,
  "rgb(224,228,229)": colors.buildingStroke, // Light gray
  "rgba(224,228,229,1)": colors.buildingStroke,
  "rgb(223,219,215)": colors.buildingStroke, // Light gray
  "rgba(223,219,215,1)": colors.buildingStroke,
  "rgb(221,219,202)": colors.building, // Light cream/tan
  "rgba(221,219,202,1)": colors.building,
  "rgb(219,214,189)": colors.building, // Light tan
  "rgba(219,214,189,1)": colors.building,
  "rgb(253,242,252)": colors.commercial, // Very light pink
  "rgba(253,242,252,1)": colors.commercial,
  "rgb(215,224,230)": colors.buildingStroke, // Light blue-gray
  "rgba(215,224,230,1)": colors.buildingStroke,
  "rgb(197,204,211)": colors.buildingStroke, // Blue-gray
  "rgba(197,204,211,1)": colors.buildingStroke,
  "rgb(188,202,213)": colors.buildingStroke, // Blue-gray
  "rgba(188,202,213,1)": colors.buildingStroke,
  "rgb(177,187,196)": colors.buildingStroke, // Gray-blue
  "rgba(177,187,196,1)": colors.buildingStroke,
});

/**
 * Creates a color replacer function for a given replacement map.
 */
const createColorReplacer = (replacements: Record<string, string>) => {
  const replaceColors = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === "string") {
      if (replacements[obj]) {
        return replacements[obj];
      }
      const lowerObj = obj.toLowerCase();
      if (replacements[lowerObj]) {
        return replacements[lowerObj];
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(replaceColors);
    }

    if (typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = replaceColors(value);
      }
      return result;
    }

    return obj;
  };

  return replaceColors;
};

interface StyleVariant {
  name: string;
  filename: string;
  colors: MapColorPalette;
  description: string;
}

const styleVariants: StyleVariant[] = [
  {
    name: "timetiles-cartographic-light",
    filename: "cartographic-light.json",
    colors: lightMapColors,
    description: "Light mode map style using TimeTiles cartographic design system",
  },
  {
    name: "timetiles-cartographic-dark",
    filename: "cartographic-dark.json",
    colors: darkMapColors,
    description: "Dark mode map style using TimeTiles cartographic design system",
  },
];

const generateMapStyle = async (): Promise<void> => {
  const sourceUrl = "https://tiles.versatiles.org/assets/styles/colorful/style.json";
  const outputDir = path.join(process.cwd(), "public/map-styles");

  console.log("Generating cartographic map styles...");
  console.log(`  Source: ${sourceUrl}`);
  console.log(`  Output directory: ${outputDir}`);

  // Fetch the source style once
  console.log("\n1. Fetching VersaTiles colorful style...");
  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch style: ${response.status} ${response.statusText}`);
  }

  const sourceStyle = (await response.json()) as Record<string, unknown>;
  const layerCount = (sourceStyle.layers as unknown[])?.length ?? 0;
  console.log(`   Fetched style with ${layerCount} layers`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate each variant
  const results: Array<{ name: string; file: string; size: number }> = [];

  for (const variant of styleVariants) {
    console.log(`\n2. Generating ${variant.name}...`);

    const replacements = createColorReplacements(variant.colors);
    const replaceColors = createColorReplacer(replacements);
    const transformedStyle = replaceColors(sourceStyle) as Record<string, unknown>;

    // Update style metadata
    transformedStyle.name = variant.name;

    const metadata = (transformedStyle.metadata ?? {}) as Record<string, unknown>;
    metadata["timetiles:generated"] = new Date().toISOString();
    metadata["timetiles:source"] = sourceUrl;
    metadata["timetiles:description"] = variant.description;
    metadata["timetiles:variant"] = variant.name.includes("dark") ? "dark" : "light";
    transformedStyle.metadata = metadata;

    // Write the file
    const outputPath = path.join(outputDir, variant.filename);
    fs.writeFileSync(outputPath, JSON.stringify(transformedStyle, null, 2));

    const fileSize = Math.round(fs.statSync(outputPath).size / 1024);
    results.push({ name: variant.name, file: variant.filename, size: fileSize });

    console.log(`   Written: ${variant.filename} (${fileSize} KB)`);
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("GENERATION COMPLETE");
  console.log("=".repeat(50));
  console.log(`  Layers processed: ${layerCount}`);
  console.log(`  Variants generated: ${results.length}`);
  for (const result of results) {
    console.log(`    - ${result.file} (${result.size} KB)`);
  }
  console.log("=".repeat(50) + "\n");
};

// Run the script
generateMapStyle().catch((error) => {
  console.error("Failed to generate map style:", error);
  process.exit(1);
});
