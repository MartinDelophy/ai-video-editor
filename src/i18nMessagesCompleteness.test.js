import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LANGUAGES } from "./i18n.js";
import { UI_MESSAGE_COPY } from "./i18nMessages.js";

const traverse = traverseModule.default?.default ?? traverseModule.default ?? traverseModule;
const USER_MESSAGE_CALL = /^(?:notify|commit|clear|replace|setStatus|setStatusText|reject|onProgress|confirm|alert|Error)/;

function callName(node) {
  const callee = node.callee;
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression") return callee.property?.name ?? callee.property?.value ?? "";
  return "";
}

function belongsToUserMessage(path) {
  return Boolean(path.findParent((parent) => (parent.isCallExpression() || parent.isNewExpression()) && USER_MESSAGE_CALL.test(callName(parent.node))));
}

function collectLegacyMessages(directory, messages = new Set()) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const info = statSync(path);
    if (info.isDirectory() && name !== "vendor") collectLegacyMessages(path, messages);
    else if (/\.(?:js|jsx)$/.test(name) && !/\.test\.[^.]+$/.test(name) && !/i18n|ttsText|asr\.js|workers/.test(path)) {
      const ast = parse(readFileSync(path, "utf8"), { sourceType: "module", plugins: ["jsx"] });
      traverse(ast, {
        StringLiteral(path) {
          if (/[\u3400-\u9fff]/u.test(path.node.value) && belongsToUserMessage(path)) messages.add(path.node.value.replace(/\s+/g, " ").trim());
        },
        TemplateLiteral(path) {
          const value = path.node.quasis.map((part, index) => `${part.value.cooked}${index < path.node.expressions.length ? `{${index}}` : ""}`).join("").replace(/\s+/g, " ").trim();
          if (/[\u3400-\u9fff]/u.test(value) && belongsToUserMessage(path)) messages.add(value);
        },
      });
    }
  }
  return messages;
}

describe("legacy user-visible message localization", () => {
  it("keeps every hard-coded Chinese message in every locale catalog", () => {
    const messages = collectLegacyMessages(new URL(".", import.meta.url).pathname);
    for (const { id } of APP_LANGUAGES) {
      for (const message of messages) {
        expect(Object.hasOwn(UI_MESSAGE_COPY[id] ?? {}, message), `${id}: ${message}`).toBe(true);
      }
    }
  }, 60_000);
});
