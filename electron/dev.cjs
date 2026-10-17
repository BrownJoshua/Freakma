// `npm run app`: start the Vite dev server, then open Electron pointed at it.
const { spawn } = require("child_process");

(async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { port: 5173 } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  console.log(`Freakma dev server: ${url}`);
  const electron = require("electron"); // path to the binary
  const child = spawn(electron, ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_SERVER_URL: url } });
  child.on("close", async (code) => {
    await server.close();
    process.exit(code ?? 0);
  });
})();
