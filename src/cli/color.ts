const ENABLED = process.stdout.isTTY || process.stderr.isTTY;

export const color = {
  bold: (text: string): string => paint(text, 1),
  cyan: (text: string): string => paint(text, 36),
  gray: (text: string): string => paint(text, 90),
  green: (text: string): string => paint(text, 32),
  magenta: (text: string): string => paint(text, 35),
  yellow: (text: string): string => paint(text, 33),
};

function paint(text: string, code: number): string {
  if (!ENABLED) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}
