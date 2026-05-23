export type ValidationReceiptInput = {
  command: string;
  exitCode: number;
  durationMs: number;
  stdout?: string;
  stderr?: string;
  tailLines?: number;
};

export type ValidationReceipt = {
  command: string;
  exitCode: number;
  durationMs: number;
  passed: boolean;
  stdoutTail: string;
  stderrTail: string;
};

export function recordValidationReceipt(input: ValidationReceiptInput): ValidationReceipt {
  const tailLines = input.tailLines ?? 20;
  return {
    command: input.command,
    exitCode: input.exitCode,
    durationMs: input.durationMs,
    passed: input.exitCode === 0,
    stdoutTail: tailText(input.stdout || "", tailLines),
    stderrTail: tailText(input.stderr || "", tailLines),
  };
}

export function validationReceiptsPassed(receipts: ValidationReceipt[], requiredCommands: string[]): boolean {
  for (const command of requiredCommands) {
    const receipt = receipts.find((item) => item.command === command);
    if (!receipt || !receipt.passed) return false;
  }
  return true;
}

function tailText(text: string, maxLines: number): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  return lines.slice(-Math.max(1, maxLines)).join("\n");
}
