import { createInterface } from "node:readline/promises";

export function createIo(input, output) {
  const terminal = input.isTTY === true;
  const rl = createInterface({ input, output, terminal });
  let muted = false;

  if (terminal) {
    rl._writeToOutput = (text) => {
      if (!muted) output.write(text);
    };
  }

  return {
    async ask(question, fallback) {
      const suffix = fallback === undefined || fallback === "" ? "" : ` [${fallback}]`;
      return (await rl.question(`${question}${suffix}: `)).trim();
    },
    async secret(question) {
      output.write(`${question}: `);
      muted = true;
      try {
        return await rl.question("");
      } finally {
        muted = false;
        output.write("\n");
      }
    },
    write(text) {
      output.write(`${text}\n`);
    },
    close() {
      rl.close();
    },
  };
}
