import { describe, expect, it, vi } from "vitest";

import { TypeTransformationService } from "../../../lib/services/type-transformation";

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

describe("TypeTransformationService", () => {
  describe("transformRecord", () => {
    it("transforms string to number", async () => {
      const transformations = [
        {
          fieldPath: "age",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { name: "John", age: "25" };

      const result = await service.transformRecord(record);

      expect(result.transformed).toEqual({ name: "John", age: 25 });
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toMatchObject({
        path: "age",
        oldValue: "25",
        newValue: 25,
      });
    });

    it("transforms multiple fields", async () => {
      const transformations = [
        {
          fieldPath: "age",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
        {
          fieldPath: "active",
          fromType: "string",
          toType: "boolean",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { name: "John", age: "30", active: "true" };

      const result = await service.transformRecord(record);

      expect(result.transformed).toEqual({
        name: "John",
        age: 30,
        active: true,
      });
      expect(result.changes).toHaveLength(2);
    });

    it("skips disabled transformations", async () => {
      const transformations = [
        {
          fieldPath: "age",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: false,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { age: "25" };

      const result = await service.transformRecord(record);

      expect(result.transformed).toEqual({ age: "25" });
      expect(result.changes).toHaveLength(0);
    });

    it("handles nested field paths", async () => {
      const transformations = [
        {
          fieldPath: "user.details.age",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = {
        user: {
          name: "John",
          details: {
            age: "25",
            city: "NYC",
          },
        },
      };

      const result = await service.transformRecord(record);
      const transformed = result.transformed as { user: { details: { age: number; city: string } } };

      expect(transformed.user.details.age).toBe(25);
      expect(transformed.user.details.city).toBe("NYC");
    });

    it("creates nested structure if missing", async () => {
      const transformations = [
        {
          fieldPath: "deeply.nested.value",
          fromType: "string",
          toType: "number",
          transformStrategy: "cast",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { deeply: { nested: { value: "123" } } };

      const result = await service.transformRecord(record);

      expect(result.transformed).toEqual({
        deeply: { nested: { value: 123 } },
      });
    });

    it("skips transformation if type doesn't match", async () => {
      const transformations = [
        {
          fieldPath: "age",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { age: 25 }; // Already a number

      const result = await service.transformRecord(record);

      expect(result.transformed).toEqual({ age: 25 });
      expect(result.changes).toHaveLength(0);
    });

    it("handles null and undefined values", async () => {
      const transformations = [
        {
          fieldPath: "value",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);

      const result1 = await service.transformRecord({ value: null });
      expect(result1.transformed).toEqual({ value: null });
      expect(result1.changes).toHaveLength(0);

      const result2 = await service.transformRecord({ value: undefined });
      expect(result2.transformed).toEqual({ value: undefined });
      expect(result2.changes).toHaveLength(0);
    });

    it("records errors for failed transformations", async () => {
      const transformations = [
        {
          fieldPath: "age",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { age: "not-a-number" };

      const result = await service.transformRecord(record);

      expect(result.transformed).toEqual({ age: "not-a-number" });
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toMatchObject({
        path: "age",
        oldValue: "not-a-number",
        newValue: null,
        error: expect.stringContaining("Cannot parse"),
      });
    });
  });

  describe("parse strategy", () => {
    describe("string to number", () => {
      it("parses valid numbers", async () => {
        const transformations = [
          {
            fieldPath: "value",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
          },
        ];

        const service = new TypeTransformationService(transformations);

        const testCases = [
          { input: "123", expected: 123 },
          { input: "123.45", expected: 123.45 },
          { input: "-42", expected: -42 },
          { input: "0", expected: 0 },
          { input: "1e3", expected: 1000 },
        ];

        for (const testCase of testCases) {
          const result = await service.transformRecord({ value: testCase.input });
          expect(result.transformed.value).toBe(testCase.expected);
        }
      });

      it("fails on invalid numbers", async () => {
        const transformations = [
          {
            fieldPath: "value",
            fromType: "string",
            toType: "number",
            transformStrategy: "parse",
            enabled: true,
          },
        ];

        const service = new TypeTransformationService(transformations);
        const result = await service.transformRecord({ value: "abc" });

        expect(result.changes[0]?.error).toContain("Cannot parse");
      });
    });

    describe("string to boolean", () => {
      it("parses valid boolean strings", async () => {
        const transformations = [
          {
            fieldPath: "value",
            fromType: "string",
            toType: "boolean",
            transformStrategy: "parse",
            enabled: true,
          },
        ];

        const service = new TypeTransformationService(transformations);

        const trueCases = ["true", "True", "TRUE", "1", "yes", "Yes"];
        for (const input of trueCases) {
          const result = await service.transformRecord({ value: input });
          expect(result.transformed.value).toBe(true);
        }

        const falseCases = ["false", "False", "FALSE", "0", "no", "No"];
        for (const input of falseCases) {
          const result = await service.transformRecord({ value: input });
          expect(result.transformed.value).toBe(false);
        }
      });

      it("fails on invalid boolean strings", async () => {
        const transformations = [
          {
            fieldPath: "value",
            fromType: "string",
            toType: "boolean",
            transformStrategy: "parse",
            enabled: true,
          },
        ];

        const service = new TypeTransformationService(transformations);
        const result = await service.transformRecord({ value: "maybe" });

        expect(result.changes[0]?.error).toContain("Cannot parse");
      });
    });

    describe("string to date", () => {
      it("parses valid date strings", async () => {
        const transformations = [
          {
            fieldPath: "value",
            fromType: "string",
            toType: "date",
            transformStrategy: "parse",
            enabled: true,
          },
        ];

        const service = new TypeTransformationService(transformations);

        const testCases = ["2024-03-15", "2024-03-15T10:30:00Z", "March 15, 2024", "03/15/2024"];

        for (const input of testCases) {
          const result = await service.transformRecord({ value: input });
          const transformed = result.transformed as { value: string };
          expect(transformed.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
          expect(new Date(transformed.value).toISOString()).toBe(transformed.value);
        }
      });

      it("fails on invalid date strings", async () => {
        const transformations = [
          {
            fieldPath: "value",
            fromType: "string",
            toType: "date",
            transformStrategy: "parse",
            enabled: true,
          },
        ];

        const service = new TypeTransformationService(transformations);
        const result = await service.transformRecord({ value: "not-a-date" });

        expect(result.changes[0]?.error).toContain("Cannot parse");
      });
    });
  });

  describe("cast strategy", () => {
    it("casts to string", async () => {
      const transformations = [
        {
          fieldPath: "value",
          fromType: "number",
          toType: "string",
          transformStrategy: "cast",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);

      const testCases = [{ input: 123, expected: "123" }];

      for (const testCase of testCases) {
        const result = await service.transformRecord({ value: testCase.input });
        expect(result.transformed.value).toBe(testCase.expected);
      }

      // Test boolean separately with correct fromType
      const boolTransformations = [
        {
          fieldPath: "value",
          fromType: "boolean",
          toType: "string",
          transformStrategy: "cast",
          enabled: true,
        },
      ];
      const boolService = new TypeTransformationService(boolTransformations);

      const boolResult1 = await boolService.transformRecord({ value: true });
      expect(boolResult1.transformed.value).toBe("true");

      const boolResult2 = await boolService.transformRecord({ value: false });
      expect(boolResult2.transformed.value).toBe("false");
    });

    it("casts to number", async () => {
      const transformations = [
        {
          fieldPath: "value",
          fromType: "boolean",
          toType: "number",
          transformStrategy: "cast",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);

      const result1 = await service.transformRecord({ value: true });
      expect(result1.transformed.value).toBe(1);

      const result2 = await service.transformRecord({ value: false });
      expect(result2.transformed.value).toBe(0);
    });

    it("casts to boolean", async () => {
      const transformations = [
        {
          fieldPath: "value",
          fromType: "number",
          toType: "boolean",
          transformStrategy: "cast",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);

      const testCases = [
        { input: 1, expected: true },
        { input: 0, expected: false },
        { input: -1, expected: true },
        { input: 100, expected: true },
      ];

      for (const testCase of testCases) {
        const result = await service.transformRecord({ value: testCase.input });
        expect(result.transformed.value).toBe(testCase.expected);
      }
    });
  });

  describe("custom transformation", () => {
    it("executes custom transform function", async () => {
      const transformations = [
        {
          fieldPath: "temperature",
          fromType: "string",
          toType: "number",
          transformStrategy: "custom",
          customTransform: `
          const celsius = parseFloat(value.replace('°C', ''));
          return (celsius * 9/5) + 32; // Convert to Fahrenheit
        `,
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { temperature: "20°C" };

      const result = await service.transformRecord(record);

      expect(result.transformed.temperature).toBe(68);
    });

    it("provides context utilities to custom functions", async () => {
      const transformations = [
        {
          fieldPath: "date",
          fromType: "string",
          toType: "date",
          transformStrategy: "custom",
          customTransform: `
          return context.parse.date(value).toISOString();
        `,
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { date: "2024-03-15" };

      const result = await service.transformRecord(record);

      expect(result.transformed.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("handles custom transform errors", async () => {
      const transformations = [
        {
          fieldPath: "value",
          fromType: "string",
          toType: "number",
          transformStrategy: "custom",
          customTransform: `
          throw new Error('Custom error');
        `,
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { value: "test" };

      const result = await service.transformRecord(record);

      expect(result.changes[0]?.error).toContain("Custom transform failed");
    });

    it("prevents code injection in custom transforms", async () => {
      const transformations = [
        {
          fieldPath: "value",
          fromType: "string",
          toType: "string",
          transformStrategy: "custom",
          customTransform: `
          // Attempt to access process or require
          try {
            process.exit(1);
          } catch (e) {}
          try {
            require('fs');
          } catch (e) {}
          return value + ' (safe)';
        `,
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { value: "test" };

      const result = await service.transformRecord(record);

      // Should execute safely without access to dangerous globals
      expect(result.transformed.value).toBe("test (safe)");
    });
  });

  describe("reject strategy", () => {
    it("throws error on type mismatch", async () => {
      const transformations = [
        {
          fieldPath: "age",
          fromType: "string",
          toType: "number",
          transformStrategy: "reject",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = { age: "25" };

      const result = await service.transformRecord(record);

      expect(result.changes[0]?.error).toContain("Type mismatch");
    });
  });

  describe("complex scenarios", () => {
    it("handles array of transformations with mixed results", async () => {
      const transformations = [
        {
          fieldPath: "age",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
        {
          fieldPath: "score",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
        {
          fieldPath: "active",
          fromType: "string",
          toType: "boolean",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = {
        age: "30",
        score: "invalid",
        active: "true",
      };

      const result = await service.transformRecord(record);

      expect(result.transformed.age).toBe(30);
      expect(result.transformed.score).toBe("invalid"); // Failed, unchanged
      expect(result.transformed.active).toBe(true);
      expect(result.changes).toHaveLength(3);
      expect(result.changes[1]?.error).toBeDefined();
    });

    it("preserves untransformed fields", async () => {
      const transformations = [
        {
          fieldPath: "count",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const record = {
        id: "123",
        name: "Test",
        count: "42",
        metadata: { foo: "bar" },
      };

      const result = await service.transformRecord(record);

      expect(result.transformed).toEqual({
        id: "123",
        name: "Test",
        count: 42,
        metadata: { foo: "bar" },
      });
    });

    it("handles deep cloning correctly", async () => {
      const transformations = [
        {
          fieldPath: "data.value",
          fromType: "string",
          toType: "number",
          transformStrategy: "parse",
          enabled: true,
        },
      ];

      const service = new TypeTransformationService(transformations);
      const original = {
        data: { value: "123", other: { nested: true } },
      };

      const result = await service.transformRecord(original);
      const transformed = result.transformed as { data: { value: number; other: { nested: boolean } } };

      // Original should be unchanged
      expect(original.data.value).toBe("123");
      expect(transformed.data.value).toBe(123);

      // Deep properties should be cloned
      expect(transformed.data.other).toEqual({ nested: true });
      expect(transformed.data.other).not.toBe(original.data.other);
    });
  });
});
