import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import path from "path";
import { fileURLToPath } from "url";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const runtimeDir =
  // CJS bundle runtime (production): __dirname is defined
  typeof __dirname !== "undefined"
    ? __dirname
    // ESM dev runtime (tsx): compute from import.meta.url
    : path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(runtimeDir, "..", "hawkins-broadcast", "dist", "public");

app.use(express.static(staticDir));
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api") || req.path.startsWith("/ws")) return next();
  res.sendFile(path.join(staticDir, "index.html"));
});

export default app;
