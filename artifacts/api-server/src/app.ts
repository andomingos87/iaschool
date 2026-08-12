import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Limite global conservador; a rota de geração define seu próprio limite maior
// (o parser global precisa PULAR essa rota, senão o limite de 1 MB vence e
// qualquer corpo maior devolve 413 antes de chegar à rota).
const GENERATION_PATH = "/api/generation/post-image";
const globalJson = express.json({ limit: "1mb" });
app.use((req, res, next) => {
  if (req.path === GENERATION_PATH) return next();
  return globalJson(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", router);

export default app;
