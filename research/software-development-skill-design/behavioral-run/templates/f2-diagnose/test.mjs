import assert from "node:assert/strict";
import { parseRetryCount } from "./src/retry.js";
assert.equal(parseRetryCount("0"), 0);
assert.equal(parseRetryCount("2"), 2);
assert.equal(parseRetryCount("bad", 4), 4);
console.log("retry assertions ok");
