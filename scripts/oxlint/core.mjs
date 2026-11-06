/**
 * ESLint core rules without an oxlint port, plus the interface naming check, packaged as
 * an oxlint JS plugin.
 *
 * @module
 */
import { builtinRules } from "eslint/use-at-your-own-risk";

// Same check as typescript-eslint's PascalCase format: uppercase start, no underscores.
const isPascalCase = (name) => name[0] === name[0].toUpperCase() && !name.includes("_");

/** Interfaces are PascalCase and carry no `I` prefix. */
const interfaceName = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { name: "Interface name `{{name}}` must be PascalCase without an I prefix." },
  },
  create: (context) => ({
    TSInterfaceDeclaration: (node) => {
      const { name } = node.id;
      if (/^I[A-Z]/.test(name) || !isPascalCase(name))
        context.report({ node: node.id, messageId: "name", data: { name } });
    },
  }),
};

const plugin = {
  meta: { name: "core" },
  rules: {
    "interface-name": interfaceName,
    "no-restricted-syntax": builtinRules.get("no-restricted-syntax"),
    "require-atomic-updates": builtinRules.get("require-atomic-updates"),
  },
};

export default plugin;
