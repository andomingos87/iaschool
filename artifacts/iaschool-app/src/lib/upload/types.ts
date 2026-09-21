// Estado do upload em massa, como a tela o enxerga.

export type UploadItemStatus =
  /** Na fila, com o File em mãos. */
  | "queued"
  | "hashing"
  /** Hash pronto; aguardando conferência de duplicidade e vaga de upload. */
  | "hashed"
  | "preparing"
  | "uploading"
  | "done"
  /** Já havia foto com o mesmo conteúdo neste evento (R2). */
  | "duplicate"
  /** Esgotou as retentativas ou o arquivo não pôde ser lido. */
  | "failed"
  /** Ficou pendente numa sessão anterior; sem o File até a pasta ser arrastada de novo. */
  | "detached";

export interface UploadItem {
  /** `${name}|${size}|${lastModified}`. */
  key: string;
  name: string;
  size: number;
  lastModified: number;
  type: string;
  status: UploadItemStatus;
  hash?: string;
  attempts: number;
  error?: string;
}

export interface UploadCounts {
  /** Arquivos aceitos nesta e em sessões anteriores (sem os rejeitados). */
  total: number;
  done: number;
  duplicate: number;
  failed: number;
  /** hashing + hashed + preparing + uploading. */
  inProgress: number;
  queued: number;
  /** Pendentes de outra sessão, à espera da pasta. */
  detached: number;
}

export interface UploadSnapshot {
  eventId: string;
  items: UploadItem[];
  counts: UploadCounts;
  /** Há trabalho em andamento. */
  running: boolean;
  /** Última vez que arquivos foram adicionados: quantos entraram e quantos foram recusados. */
  lastAdd?: AddFilesResult;
}

export interface AddFilesResult {
  /** Entraram na fila (ou voltaram a ela). */
  accepted: number;
  /** Fora do formato aceito (JPEG, PNG, HEIC). */
  rejected: number;
  /** Já constavam como enviados em sessão anterior — pulados sem tocar a rede. */
  alreadySent: number;
  /** Zero quando o lote cabe no limite; senão, quantos passaram de 5.000. */
  overLimit: number;
}
