/**
 * Zustand store for import wizard state management.
 *
 * A global store that provides:
 * - Direct access from any component (no Provider needed)
 * - Granular subscriptions (components re-render only on their slice)
 * - Built-in localStorage persistence via `persist` middleware
 * - DevTools integration via `devtools` middleware
 *
 * State and action contracts live in `wizard-state.ts`; the actions are
 * implemented by the navigation, source and mapping slices.
 *
 * The store is initialized with server-provided auth state via
 * {@link useWizardEffects} in the layout component.
 *
 * @module
 * @category Components
 */
"use client";

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { createMappingSlice } from "./wizard-mapping-slice";
import { createNavigationSlice } from "./wizard-navigation-slice";
import { wizardPersistOptions } from "./wizard-persistence";
import { createSourceSlice } from "./wizard-source-slice";
import { initialState, type WizardStore } from "./wizard-state";

export const useWizardStore = create<WizardStore>()(
  devtools(
    persist(
      (...a) => ({
        ...initialState,
        _initialized: false,
        _savedAt: 0,
        ...createNavigationSlice(...a),
        ...createSourceSlice(...a),
        ...createMappingSlice(...a),
      }),
      wizardPersistOptions
    ),
    { name: "WizardStore" }
  )
);

/**
 * Shared shallow-selector wrapper for grouped step hooks.
 *
 * Keeps step components concise without broadening their subscriptions to the
 * entire store.
 */
const useWizardStepSlice = <T>(selector: (state: WizardStore) => T): T => useWizardStore(useShallow(selector));

export const useWizardUploadStepState = () =>
  useWizardStepSlice((state) => ({
    file: state.file,
    sheets: state.sheets,
    sourceUrl: state.sourceUrl,
    editMode: state.editMode,
    authConfig: state.authConfig,
    jsonApiConfig: state.jsonApiConfig,
    nextStep: state.nextStep,
    loadFile: state.loadFile,
    setSourceUrlInput: state.setSourceUrlInput,
    setJsonApiInput: state.setJsonApiInput,
    unloadFile: state.unloadFile,
  }));

export const useWizardDatasetSelectionStepState = () =>
  useWizardStepSlice((state) => ({
    sheets: state.sheets,
    selectedCatalogId: state.selectedCatalogId,
    newCatalogName: state.newCatalogName,
    sheetMappings: state.sheetMappings,
    configSuggestions: state.configSuggestions,
    fileName: state.file?.name,
    nextStep: state.nextStep,
    selectCatalog: state.selectCatalog,
    setDatasetTarget: state.setDatasetTarget,
    applyDatasetSelectionSuggestion: state.applyDatasetSelectionSuggestion,
    applyFieldMappingSuggestion: state.applyFieldMappingSuggestion,
  }));

export const useWizardFieldMappingStepState = () =>
  useWizardStepSlice((state) => ({
    sheets: state.sheets,
    fieldMappings: state.fieldMappings,
    sheetMappings: state.sheetMappings,
    deduplicationStrategy: state.deduplicationStrategy,
    geocodingEnabled: state.geocodingEnabled,
    previewId: state.previewId,
    transforms: state.transforms,
    configSuggestions: state.configSuggestions,
    nextStep: state.nextStep,
    setFieldMapping: state.setFieldMapping,
    setImportOptions: state.setImportOptions,
    setTransforms: state.setTransforms,
    applyFieldMappingSuggestion: state.applyFieldMappingSuggestion,
    resetFieldMappingToAutoDetected: state.resetFieldMappingToAutoDetected,
  }));

export const useWizardScheduleStepState = () =>
  useWizardStepSlice((state) => ({
    sourceUrl: state.sourceUrl,
    scheduleConfig: state.scheduleConfig,
    authConfig: state.authConfig,
    file: state.file,
    editMode: state.editMode,
    nextStep: state.nextStep,
    prevStep: state.prevStep,
    configureSchedule: state.configureSchedule,
    setUrlAuth: state.setUrlAuth,
  }));

export const useWizardReviewStepState = () =>
  useWizardStepSlice((state) => ({
    file: state.file,
    sheets: state.sheets,
    selectedCatalogId: state.selectedCatalogId,
    newCatalogName: state.newCatalogName,
    sheetMappings: state.sheetMappings,
    fieldMappings: state.fieldMappings,
    deduplicationStrategy: state.deduplicationStrategy,
    geocodingEnabled: state.geocodingEnabled,
    sourceUrl: state.sourceUrl,
    authConfig: state.authConfig,
    scheduleConfig: state.scheduleConfig,
    jsonApiConfig: state.jsonApiConfig,
    previewId: state.previewId,
    transforms: state.transforms,
    error: state.error,
    editMode: state.editMode,
    editScheduleId: state.editScheduleId,
    prevStep: state.prevStep,
    startProcessing: state.startProcessing,
    nextStep: state.nextStep,
    setError: state.setError,
  }));

export const useWizardPreviewValidationState = () =>
  useWizardStepSlice((state) => ({
    previewId: state.previewId,
    currentStep: state.currentStep,
    startedAuthenticated: state.startedAuthenticated,
    ingestFileId: state.ingestFileId,
    editMode: state.editMode,
  }));

export const useWizardProceedState = () =>
  useWizardStepSlice((state) => ({
    currentStep: state.currentStep,
    file: state.file,
    sheets: state.sheets,
    selectedCatalogId: state.selectedCatalogId,
    newCatalogName: state.newCatalogName,
    sheetMappings: state.sheetMappings,
    fieldMappings: state.fieldMappings,
    scheduleConfig: state.scheduleConfig,
  }));
