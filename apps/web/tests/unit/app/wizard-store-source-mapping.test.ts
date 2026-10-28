/**
 * Unit tests for the wizard store's source credentials, mapping reset and step initialization.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it } from "vitest";

import { initialState } from "@/app/[locale]/(frontend)/ingest/_components/wizard-state";
import { useWizardStore } from "@/app/[locale]/(frontend)/ingest/_components/wizard-store";
import { createEmptyFieldMapping } from "@/lib/ingest/field-mapping-utils";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { SheetInfo, UrlAuthConfig } from "@/lib/ingest/types/wizard";

import { TEST_TOKENS } from "../../constants/test-credentials";

const auth: UrlAuthConfig = { type: "bearer", bearerToken: TEST_TOKENS.generic };

const sheet = (index: number, titlePath: string | null): SheetInfo => ({
  index,
  name: `Sheet${index}`,
  rowCount: 1,
  headers: ["name", "edited"],
  sampleData: [{ name: "Concert", edited: "x" }],
  suggestedMappings: {
    language: { code: "eng", name: "English", confidence: 0.9, isReliable: true },
    mappings: {
      titlePath: { path: titlePath, confidence: 0.9, confidenceLevel: "high" },
      descriptionPath: { path: null, confidence: 0, confidenceLevel: "none" },
      locationNamePath: { path: null, confidence: 0, confidenceLevel: "none" },
      timestampPath: { path: null, confidence: 0, confidenceLevel: "none" },
      endTimestampPath: { path: null, confidence: 0, confidenceLevel: "none" },
      latitudePath: { path: null, confidence: 0, confidenceLevel: "none" },
      longitudePath: { path: null, confidence: 0, confidenceLevel: "none" },
      locationPath: { path: null, confidence: 0, confidenceLevel: "none" },
    },
  },
});

const transform: IngestTransform = { id: "t1", type: "rename", active: true, autoDetected: false, from: "a", to: "b" };

afterEach(() => {
  useWizardStore.setState({ ...initialState, _initialized: false, _savedAt: 0 });
});

describe("setSourceUrlInput", () => {
  it("keeps the credentials when none are passed", () => {
    useWizardStore.getState().setUrlAuth(auth);
    useWizardStore.getState().setSourceUrlInput("https://example.com/b.csv");

    expect(useWizardStore.getState()).toMatchObject({ sourceUrl: "https://example.com/b.csv", authConfig: auth });
  });

  it("clears the credentials on an explicit null", () => {
    useWizardStore.getState().setUrlAuth(auth);
    useWizardStore.getState().setSourceUrlInput("https://example.com/b.csv", null);

    expect(useWizardStore.getState().authConfig).toBeNull();
  });
});

describe("resetFieldMappingToAutoDetected", () => {
  it("restores the suggestions and drops the transforms of that sheet only", () => {
    const edited = { ...createEmptyFieldMapping(0), titleField: "edited" };
    const other = { ...createEmptyFieldMapping(1), titleField: "edited" };
    useWizardStore.setState({
      sheets: [sheet(0, "name"), sheet(1, "name")],
      fieldMappings: [edited, other],
      transforms: { 0: [transform], 1: [transform] },
    });

    useWizardStore.getState().resetFieldMappingToAutoDetected(0);

    const state = useWizardStore.getState();
    expect(state.fieldMappings[0]?.titleField).toBe("name");
    expect(state.fieldMappings[1]).toBe(other);
    expect(state.transforms).toEqual({ 1: [transform] });
  });

  it("leaves the mappings alone for a sheet the preview does not have", () => {
    const edited = { ...createEmptyFieldMapping(3), titleField: "edited" };
    useWizardStore.setState({ sheets: [sheet(0, "name")], fieldMappings: [edited], transforms: { 3: [transform] } });

    useWizardStore.getState().resetFieldMappingToAutoDetected(3);

    expect(useWizardStore.getState().fieldMappings).toEqual([edited]);
    expect(useWizardStore.getState().transforms).toEqual({});
  });
});

describe("initialize", () => {
  it("sends an unauthenticated user to the auth step even from a restored later step", () => {
    useWizardStore.setState({ currentStep: 4 });

    useWizardStore.getState().initialize({ isAuthenticated: false, isEmailVerified: false });

    expect(useWizardStore.getState()).toMatchObject({ currentStep: 1, startedAuthenticated: false });
  });

  it("keeps a restored step for a verified user and runs only once", () => {
    useWizardStore.setState({ currentStep: 4 });

    useWizardStore.getState().initialize({ isAuthenticated: true, isEmailVerified: true });
    useWizardStore.getState().initialize({ isAuthenticated: false, isEmailVerified: false });

    expect(useWizardStore.getState()).toMatchObject({ currentStep: 4, startedAuthenticated: true });
  });
});
