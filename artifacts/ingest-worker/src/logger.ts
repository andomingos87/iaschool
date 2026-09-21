// Log estruturado (spec §11): por job vão `batch_id`, `photo_id`, `job_id`,
// `attempt`, `duration_ms` e `result`. Nunca nome de arquivo original, nome
// de aluno, URL assinada ou qualquer conteúdo da foto. Molde do
// artifacts/api-server/src/lib/logger.ts.

import pino, { type Logger } from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "ingest-worker" },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

export interface JobLogFields {
  batch_id: string;
  photo_id: string;
  job_id: number;
  attempt: number;
}

export function jobLogger(fields: JobLogFields): Logger {
  return logger.child(fields);
}
