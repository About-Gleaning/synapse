import Fastify from "fastify";
import cors from "@fastify/cors";
import { buildAppContext } from "./core/app-context";
import { registerRoutes } from "./api/routes";

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

const ctx = buildAppContext(app.log);
await registerRoutes(app, ctx);

const port = Number(process.env.SYNAPSE_SERVER_PORT || 38655);
const host = process.env.SYNAPSE_SERVER_HOST || "127.0.0.1";

app.listen({ port, host }).then(() => {
  app.log.info(`Synapse server started at http://${host}:${port}`);
});

process.on("SIGINT", async () => {
  ctx.close();
  await app.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  ctx.close();
  await app.close();
  process.exit(0);
});
