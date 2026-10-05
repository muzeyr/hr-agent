import cds from "@sap/cds";
import { readFileSync } from "node:fs";
import type { NextFunction, Request, Response } from "express";

/**
 * Custom bootstrap, for the chat preview that @cap-js/agents serves at
 * /a2a/<agent>/preview/ in development: a clearer approval card, and links
 * (request numbers into the Fiori apps, PDFs) that open in a new tab. The
 * plugin offers no hook for its page, so its HTML is extended on the way out
 * with the files in srv/preview/ — nothing in node_modules is touched, and
 * an `npm install` keeps it.
 */
const asset = (file: string) => readFileSync(new URL(`./preview/${file}`, import.meta.url), "utf-8");
const inject = `<style>${asset("approval-card.css")}</style>`;
const script = ["approval-card.js", "app-links.js"].map((file) => `<script>${asset(file)}</script>`).join("");
const PREVIEW = /^\/a2a\/[^/]+\/preview\/?$/;

cds.on("bootstrap", (app) => {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || !PREVIEW.test(req.path)) return next();
    const send = res.send.bind(res);
    res.send = (body: unknown) =>
      send(typeof body === "string" ? body.replace("</head>", `${inject}</head>`).replace("</body>", `${script}</body>`) : body);
    next();
  });
});

export default cds.server;
