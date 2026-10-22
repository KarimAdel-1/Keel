// A mail server for tests, on this machine: it speaks just enough SMTP for nodemailer to deliver, and keeps every email
// it receives, so tests can check what Keel sent and to whom. Nothing leaves the machine.

import net from "node:net";
import type { AddressInfo } from "node:net";

export interface ReceivedMail {
  from: string;
  to: string[];
  /** The raw message: headers and body. */
  data: string;
}

export async function serveSmtp(): Promise<{ url: string; mails: ReceivedMail[]; close: () => Promise<void> }> {
  const mails: ReceivedMail[] = [];
  const server = net.createServer((socket) => {
    let from = "";
    let to: string[] = [];
    let data: string[] | undefined;
    let buffer = "";
    const say = (line: string) => socket.write(`${line}\r\n`);
    say("220 keel-test ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let at: number;
      while ((at = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (data) {
          if (line === ".") {
            mails.push({ from, to, data: data.join("\n") });
            data = undefined;
            from = "";
            to = [];
            say("250 queued");
          } else data.push(line.startsWith("..") ? line.slice(1) : line);
          continue;
        }
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === "EHLO" || verb === "HELO") say("250 keel-test");
        else if (verb === "MAIL") {
          from = address(line);
          say("250 ok");
        } else if (verb === "RCPT") {
          to.push(address(line));
          say("250 ok");
        } else if (verb === "DATA") {
          data = [];
          say("354 go ahead");
        } else if (verb === "QUIT") {
          say("221 bye");
          socket.end();
        } else say("250 ok");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `smtp://127.0.0.1:${port}`, mails, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

/** The address in "MAIL FROM:<a@b.example> SIZE=…" or "RCPT TO:<a@b.example>". */
function address(line: string): string {
  return line.replace(/^(MAIL FROM|RCPT TO):\s*/i, "").replace(/[<>]/g, "").split(" ")[0];
}
