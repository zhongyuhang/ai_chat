export function estimateTokens(value: string): number {
  if (!value) return 0;
  let cjk = 0;
  let ascii = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code > 0x2e7f) cjk += 1;
    else if (code > 0x20) ascii += 1;
  }
  return cjk + Math.ceil(ascii / 3.5);
}
