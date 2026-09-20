import { SMTPServer } from "smtp-server";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
const folder = resolve(".local/mailbox");
await mkdir(folder, { recursive: true });
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  size: 1024 * 1024,
  onData(stream, session, callback) {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", async () => {
      try {
        await writeFile(
          resolve(folder, Date.now() + ".eml"),
          Buffer.concat(chunks),
        );
        callback();
      } catch (e) {
        callback(e);
      }
    });
  },
});
smtp.listen(1025, "127.0.0.1");
const escape = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const http = createServer(async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'",
  );
  const files = (await readdir(folder))
    .filter((f) => /^\d+\.eml$/.test(f))
    .sort()
    .reverse()
    .slice(0, 20);
  res.end(
    "<title>NexaLab Local Mailbox</title><style>body{font:15px system-ui;max-width:900px;margin:40px auto;padding:20px;background:#f4f7ef;color:#29442f}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px;border-radius:10px}</style><h1>Hộp thư phát triển NexaLab</h1><p>Chỉ chạy trên máy này. Email không được gửi ra Internet.</p>" +
      (
        await Promise.all(
          files.map(
            async (f) =>
              "<h3>" +
              escape(f) +
              "</h3><pre>" +
              escape(await readFile(resolve(folder, f), "utf8")) +
              "</pre>",
          ),
        )
      ).join(""),
  );
});
http.listen(8025, "127.0.0.1", () =>
  console.log("SMTP: 127.0.0.1:1025; local mailbox: http://127.0.0.1:8025"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    smtp.close();
    http.close();
  });
