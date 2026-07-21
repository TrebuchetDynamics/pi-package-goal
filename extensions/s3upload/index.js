export default function (pi) {
  pi.registerCommand("s3upload", {
    description: "Upload a file and return an expiring Azure link",
    handler: async (args, ctx) => {
      const request = args.trim();
      if (!request) {
        ctx.ui.notify("Usage: /s3upload <file or request>", "warning");
        return;
      }

      const message = `/skill:s3upload ${request}`;
      pi.sendUserMessage(message, ctx.isIdle() ? undefined : { deliverAs: "followUp" });
    },
  });
}
