// Compiled by `npm run typecheck` only: checks the published types the way a consumer uses them.
import express from "express";
import TransomCore = require("../../dist");
import type { RegistryMap, TransomPlugin, TransomServer } from "../../dist";
import { wrapServer } from "../../wrapper";

// Consumers add their own registry keys with declaration merging.
declare module "../../dist" {
  interface RegistryMap {
    myService: { ping(): string };
  }
}

interface MyOptions {
  greeting: string;
}

const myPlugin: TransomPlugin<MyOptions> = {
  async initialize(server: TransomServer, options: MyOptions) {
    server.registry.set("myService", { ping: () => options.greeting });
    server.get("/hello", (_req, res) => {
      res.send(server.registry.get("myService").ping());
    });
  },
  preStart(server) {
    const prefix: string = server.registry.get("transom-config.definition.uri.prefix");
    server.log?.info(prefix);
  },
};

const transom = new TransomCore();
transom.configure(myPlugin, { greeting: "hi" });
// @ts-expect-error -- options must match the plugin's options type
transom.configure(myPlugin, { greeting: 1 });

const unknownKey: unknown = transom.registry.get("not.declared", null);
const known: RegistryMap["myService"] = transom.registry.get("myService");

async function start(): Promise<void> {
  const server = await transom.initialize({
    name: "My API",
    transom: { cors: { origins: ["*"] }, bodyParser: { limit: "1mb" }, favicon: false },
    definition: { uri: { prefix: "/api/v2" }, myPlugin: { anything: true } },
  });
  server.listen(7000);

  const own = await transom.initialize(express(), { definition: {} });
  own.use("/x", (_req, _res, next) => next());
}

TransomCore.withMeta({ summary: "docs" }, (_req, res) => res.end());
const wrapped: TransomServer = wrapServer(express(), transom.registry);

export { start, unknownKey, known, wrapped };
