/** @param {NodeJS.ProcessEnv} env */
export function shouldReduceRedraw(env = process.env) {
  return Boolean(env.TMUX && (env.SSH_CONNECTION || env.SSH_TTY));
}

/** @param {import("@earendil-works/pi-coding-agent").ExtensionAPI} pi */
export default function mobileLowRedraw(pi) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui" && shouldReduceRedraw()) ctx.ui.setWorkingVisible(false);
  });
}
