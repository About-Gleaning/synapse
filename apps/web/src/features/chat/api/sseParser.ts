export async function parseSseStream(
  stream: ReadableStream<Uint8Array>,
  onMessage: (jsonText: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx < 0) {
        break;
      }

      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = frame.split("\n");
      const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
      if (dataLines.length === 0) {
        continue;
      }

      const jsonText = dataLines.join("\n");
      onMessage(jsonText);
    }
  }
}
