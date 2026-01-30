/**
 * Unit tests for flow mapping types and utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import type { FlowMappingEdge, FlowMappingNode } from "@/lib/types/flow-mapping";
import {
  createSourceNodes,
  createTargetNodes,
  flowToFieldMapping,
  TARGET_FIELD_DEFINITIONS,
} from "@/lib/types/flow-mapping";

describe("flow-mapping", () => {
  describe("TARGET_FIELD_DEFINITIONS", () => {
    it("should define required and optional fields", () => {
      expect(TARGET_FIELD_DEFINITIONS.length).toBe(8);

      const required = TARGET_FIELD_DEFINITIONS.filter((d) => d.required);
      expect(required).toHaveLength(2);
      expect(required.map((d) => d.fieldKey)).toEqual(["titleField", "dateField"]);
    });

    it("should have labels and descriptions for all fields", () => {
      for (const def of TARGET_FIELD_DEFINITIONS) {
        expect(def.label).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.icon).toBeTruthy();
      }
    });
  });

  describe("createTargetNodes", () => {
    it("should create nodes for all target field definitions", () => {
      const nodes = createTargetNodes();
      expect(nodes).toHaveLength(TARGET_FIELD_DEFINITIONS.length);
    });

    it("should set correct default positions", () => {
      const nodes = createTargetNodes();
      expect(nodes[0]!.position.x).toBe(500);
      expect(nodes[0]!.position.y).toBe(50);
      expect(nodes[1]!.position.y).toBe(130); // 50 + 1*80
    });

    it("should accept custom startY", () => {
      const nodes = createTargetNodes(100);
      expect(nodes[0]!.position.y).toBe(100);
    });

    it("should set isConnected to false and connectedColumn to null", () => {
      const nodes = createTargetNodes();
      for (const node of nodes) {
        expect(node.data.isConnected).toBe(false);
        expect(node.data.connectedColumn).toBeNull();
      }
    });

    it("should set correct node type and id format", () => {
      const nodes = createTargetNodes();
      for (const node of nodes) {
        expect(node.type).toBe("target-field");
        expect(node.id).toMatch(/^target-/);
      }
    });
  });

  describe("createSourceNodes", () => {
    it("should create nodes from headers", () => {
      const headers = ["Name", "Date", "Location"];
      const sampleData = [{ Name: "Test", Date: "2024-01-01", Location: "Berlin" }];
      const nodes = createSourceNodes(headers, sampleData, 0, "Sheet1");

      expect(nodes).toHaveLength(3);
      expect(nodes[0]!.data.columnName).toBe("Name");
      expect(nodes[0]!.data.sheetIndex).toBe(0);
      expect(nodes[0]!.data.sheetName).toBe("Sheet1");
    });

    it("should extract sample values from data", () => {
      const headers = ["Name"];
      const sampleData = [{ Name: "Alice" }, { Name: "Bob" }, { Name: "Charlie" }, { Name: "Dave" }];
      const nodes = createSourceNodes(headers, sampleData, 0, "Sheet1");

      // Should take first 3 samples
      expect(nodes[0]!.data.sampleValues).toEqual(["Alice", "Bob", "Charlie"]);
    });

    it("should infer data types from samples", () => {
      const headers = ["count"];
      const sampleData = [{ count: 42 }, { count: 100 }];
      const nodes = createSourceNodes(headers, sampleData, 0, "Sheet1");
      expect(nodes[0]!.data.inferredType).toBe("number");
    });

    it("should detect date-like strings", () => {
      const headers = ["date"];
      const sampleData = [{ date: "2024-01-01" }, { date: "2024-02-15" }];
      const nodes = createSourceNodes(headers, sampleData, 0, "Sheet1");
      expect(nodes[0]!.data.inferredType).toBe("date");
    });

    it("should detect mixed types", () => {
      const headers = ["value"];
      const sampleData = [{ value: "hello" }, { value: 42 }];
      const nodes = createSourceNodes(headers, sampleData, 0, "Sheet1");
      expect(nodes[0]!.data.inferredType).toBe("mixed");
    });

    it("should default to string for empty values", () => {
      const headers = ["empty"];
      const sampleData = [{ empty: null }, { empty: "" }];
      const nodes = createSourceNodes(headers, sampleData, 0, "Sheet1");
      expect(nodes[0]!.data.inferredType).toBe("string");
    });

    it("should detect boolean type", () => {
      const headers = ["active"];
      const sampleData = [{ active: true }, { active: false }];
      const nodes = createSourceNodes(headers, sampleData, 0, "Sheet1");
      expect(nodes[0]!.data.inferredType).toBe("boolean");
    });

    it("should detect number strings", () => {
      const headers = ["amount"];
      const sampleData = [{ amount: "123.45" }, { amount: "-67" }];
      const nodes = createSourceNodes(headers, sampleData, 0, "Sheet1");
      expect(nodes[0]!.data.inferredType).toBe("number");
    });

    it("should position nodes vertically spaced", () => {
      const headers = ["A", "B", "C"];
      const nodes = createSourceNodes(headers, [], 0, "Sheet1");
      expect(nodes[0]!.position).toEqual({ x: 50, y: 50 });
      expect(nodes[1]!.position).toEqual({ x: 50, y: 150 });
      expect(nodes[2]!.position).toEqual({ x: 50, y: 250 });
    });
  });

  describe("flowToFieldMapping", () => {
    it("should return default mapping with no edges", () => {
      const mapping = flowToFieldMapping([], [], 0);
      expect(mapping.sheetIndex).toBe(0);
      expect(mapping.titleField).toBeNull();
      expect(mapping.dateField).toBeNull();
      expect(mapping.idStrategy).toBe("auto");
    });

    it("should map source to target via edges", () => {
      const nodes: FlowMappingNode[] = [
        {
          id: "source-0-Name",
          type: "source-column",
          position: { x: 0, y: 0 },
          data: {
            columnName: "Name",
            sheetIndex: 0,
            sheetName: "Sheet1",
            sampleValues: [],
            inferredType: "string",
            confidence: 1,
            isConnected: true,
          },
        },
        {
          id: "target-titleField",
          type: "target-field",
          position: { x: 500, y: 0 },
          data: {
            fieldKey: "titleField",
            label: "Title",
            icon: "Text",
            required: true,
            description: "Title",
            isConnected: true,
            connectedColumn: "Name",
          },
        },
      ];
      const edges: FlowMappingEdge[] = [{ id: "e1", source: "source-0-Name", target: "target-titleField" }];

      const mapping = flowToFieldMapping(nodes, edges, 0);
      expect(mapping.titleField).toBe("Name");
    });

    it("should not map non-matching node types", () => {
      const nodes: FlowMappingNode[] = [
        {
          id: "target-titleField",
          type: "target-field",
          position: { x: 0, y: 0 },
          data: {
            fieldKey: "titleField",
            label: "Title",
            icon: "Text",
            required: true,
            description: "Title",
            isConnected: false,
            connectedColumn: null,
          },
        },
      ];
      const edges: FlowMappingEdge[] = [{ id: "e1", source: "nonexistent", target: "target-titleField" }];

      const mapping = flowToFieldMapping(nodes, edges, 0);
      expect(mapping.titleField).toBeNull();
    });

    it("should skip sheetIndex and idStrategy fields from edge mapping", () => {
      const nodes: FlowMappingNode[] = [
        {
          id: "source-0-Col",
          type: "source-column",
          position: { x: 0, y: 0 },
          data: {
            columnName: "Col",
            sheetIndex: 0,
            sheetName: "Sheet1",
            sampleValues: [],
            inferredType: "string",
            confidence: 1,
            isConnected: true,
          },
        },
        {
          id: "target-dateField",
          type: "target-field",
          position: { x: 500, y: 0 },
          data: {
            fieldKey: "dateField",
            label: "Date",
            icon: "Calendar",
            required: true,
            description: "Date",
            isConnected: true,
            connectedColumn: "Col",
          },
        },
      ];
      const edges: FlowMappingEdge[] = [{ id: "e1", source: "source-0-Col", target: "target-dateField" }];

      const mapping = flowToFieldMapping(nodes, edges, 2);
      expect(mapping.sheetIndex).toBe(2);
      expect(mapping.dateField).toBe("Col");
      expect(mapping.idStrategy).toBe("auto");
    });
  });
});
