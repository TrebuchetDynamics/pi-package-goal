import assert from "node:assert/strict";
import { addCents, formatCents } from "./src/money.js";
assert.equal(addCents(10, 20), 30);
assert.equal(addCents(10, 20) + addCents(30, 40), 100);
assert.equal(formatCents(101), "$1.01");
assert.throws(() => addCents(0.1, 0.2), TypeError);
console.log("money assertions ok");
