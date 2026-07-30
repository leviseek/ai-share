const ENABLED = (process.stdout.isTTY || process.stderr.isTTY) && process.env.NO_COLOR === undefined;

export type ColorPalette = {
  bold(text: string): string;
  cyan(text: string): string;
  gray(text: string): string;
  green(text: string): string;
  magenta(text: string): string;
  red(text: string): string;
  yellow(text: string): string;
};

export function createColor(enabled: boolean): ColorPalette {
  return {
    bold: (text) => paint(text, 1, enabled),
    cyan: (text) => paint(text, 36, enabled),
    gray: (text) => paint(text, 90, enabled),
    green: (text) => paint(text, 32, enabled),
    magenta: (text) => paint(text, 35, enabled),
    red: (text) => paint(text, 31, enabled),
    yellow: (text) => paint(text, 33, enabled),
  };
}

export const color: ColorPalette = createColor(ENABLED);

function paint(text: string, code: number, enabled: boolean): string {
  if (!enabled) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}
