export function splitIntoSpeechSegments(text: string) {
  return text
    .split(/(?<=[。！？!?；;：:\n])/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}
