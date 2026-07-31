/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const HEX_COLOR_REGEX =
  /#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})(?![\da-f])/i;

export function hasHardcodedHex(value) {
  return HEX_COLOR_REGEX.test(value);
}

function staticTextParts(node, parts = []) {
  if (!node || typeof node !== "object") return parts;
  if (node.type === "StringLiteral") parts.push(node.value);
  else if (node.type === "TemplateElement")
    parts.push(node.cooked ?? node.raw ?? "");
  else {
    for (const child of Object.values(node)) {
      if (Array.isArray(child))
        child.forEach((item) => staticTextParts(item, parts));
      else staticTextParts(child, parts);
    }
  }
  return parts;
}

export function jsxAttributeText(value) {
  if (typeof value?.value === "string") return value.value;
  const parts = staticTextParts(value?.expression);
  return parts.length ? parts.join(" ") : undefined;
}
