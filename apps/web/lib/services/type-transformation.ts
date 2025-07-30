/**
 * @module Provides a service for transforming data types within a record.
 *
 * This service is responsible for applying a set of configurable transformation rules to a
 * data record. It is used to clean and normalize data during the import process, handling
 * mismatches between the source data's type and the desired schema type.
 *
 * It supports several transformation strategies:
 * - `parse`: Attempts to intelligently parse a value into the target type (e.g., string to number).
 * - `cast`: Performs a direct type cast (e.g., `String(value)`).
 * - `custom`: Allows for a user-defined JavaScript function to perform the transformation.
 * - `reject`: Throws an error if a type mismatch is found.
 */
import { logger } from "../logger";

export class TypeTransformationService {
  constructor(
    private readonly transformations: Array<{
      fieldPath: string;
      fromType: string;
      toType: string;
      transformStrategy: string;
      customTransform?: string;
      enabled: boolean;
    }>,
  ) {}

  async transformRecord(record: any): Promise<{
    transformed: any;
    changes: Array<{ path: string; oldValue: any; newValue: any; error?: string }>;
  }> {
    const transformed = JSON.parse(JSON.stringify(record)); // Deep clone
    const changes: any[] = [];

    for (const rule of this.transformations) {
      if (!rule.enabled) continue;

      try {
        const result = await this.applyTransformation(transformed, rule);
        if (result.changed) {
          changes.push(result);
        }
      } catch (error: any) {
        changes.push({
          path: rule.fieldPath,
          oldValue: this.getValueAtPath(record, rule.fieldPath),
          newValue: null,
          error: error.message,
        });
      }
    }

    return { transformed, changes };
  }

  private async applyTransformation(obj: any, rule: any): Promise<any> {
    const value = this.getValueAtPath(obj, rule.fieldPath);
    if (value === undefined || value === null) {
      return { changed: false };
    }

    const actualType = this.getActualType(value);
    if (actualType !== rule.fromType) {
      return { changed: false };
    }

    let newValue: any;

    switch (rule.transformStrategy) {
      case "parse":
        newValue = this.parseValue(value, rule.toType);
        break;

      case "cast":
        newValue = this.castValue(value, rule.toType);
        break;

      case "custom":
        newValue = await this.runCustomTransform(value, rule.customTransform);
        break;

      case "reject":
        throw new Error(`Type mismatch: expected ${rule.toType}, got ${actualType}`);

      default:
        throw new Error(`Unknown transform strategy: ${rule.transformStrategy}`);
    }

    this.setValueAtPath(obj, rule.fieldPath, newValue);

    return {
      changed: true,
      path: rule.fieldPath,
      oldValue: value,
      newValue,
    };
  }

  private parseValue(value: any, toType: string): any {
    switch (toType) {
      case "number":
        const num = Number(value);
        if (isNaN(num)) throw new Error(`Cannot parse "${value}" as number`);
        return num;

      case "boolean":
        if (typeof value === "string") {
          const lower = value.toLowerCase();
          if (lower === "true" || lower === "1" || lower === "yes") return true;
          if (lower === "false" || lower === "0" || lower === "no") return false;
        }
        throw new Error(`Cannot parse "${value}" as boolean`);

      case "date":
        const date = new Date(value);
        if (isNaN(date.getTime())) throw new Error(`Cannot parse "${value}" as date`);
        return date.toISOString();

      default:
        throw new Error(`Cannot parse to type: ${toType}`);
    }
  }

  private castValue(value: any, toType: string): any {
    switch (toType) {
      case "string":
        return String(value);

      case "number":
        return Number(value);

      case "boolean":
        return Boolean(value);

      default:
        throw new Error(`Cannot cast to type: ${toType}`);
    }
  }

  private async runCustomTransform(value: any, customCode: string): Promise<any> {
    try {
      // Create safe function context
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
      const fn = new AsyncFunction("value", "context", customCode);

      const context = {
        logger: logger.child({ component: "custom-transform" }),
        parse: {
          date: (v: any) => new Date(v),
          number: (v: any) => Number(v),
          boolean: (v: any) => Boolean(v),
        },
      };

      return await fn(value, context);
    } catch (error: any) {
      throw new Error(`Custom transform failed: ${error.message}`);
    }
  }

  private getActualType(value: any): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (value instanceof Date) return "date";
    return typeof value;
  }

  private getValueAtPath(obj: any, path: string): any {
    const parts = path.split(".");
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }

    return current;
  }

  private setValueAtPath(obj: any, path: string, value: any): void {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part && !current[part]) {
        current[part] = {};
      }
      current = current[part!];
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }
}
