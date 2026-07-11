import assert from "node:assert/strict";
import { mergeDefaults } from "./src/merge.js";
assert.deepEqual(mergeDefaults({ retries: 2 }, { timeout: 10 }), { retries: 2, timeout: 10 });
