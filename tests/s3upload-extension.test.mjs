import assert from "node:assert/strict";
import registerS3Upload from "../extensions/s3upload/index.js";

const commands = new Map();
const sent = [];
const notices = [];
registerS3Upload({
  registerCommand: (name, definition) => commands.set(name, definition),
  sendUserMessage: (message, options) => sent.push({ message, options }),
});

assert.deepEqual([...commands.keys()], ["s3upload"]);

const ctx = {
  isIdle: () => true,
  ui: { notify: (message, level) => notices.push({ message, level }) },
};
await commands.get("s3upload").handler("myapp.apk", ctx);
assert.deepEqual(sent, [{ message: "/skill:s3upload myapp.apk", options: undefined }]);

await commands.get("s3upload").handler("", ctx);
assert.equal(sent.length, 1);
assert.match(notices.at(-1).message, /Usage: \/s3upload/);

await commands.get("s3upload").handler("latest apk for 48 hours", { ...ctx, isIdle: () => false });
assert.deepEqual(sent.at(-1), {
  message: "/skill:s3upload latest apk for 48 hours",
  options: { deliverAs: "followUp" },
});

console.log("s3upload-extension ok");
