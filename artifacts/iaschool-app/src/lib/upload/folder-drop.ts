// Coleta de arquivos de um drop de pasta. Percorre diretórios com a
// File and Directory Entries API quando existe; senão usa `dataTransfer.files`.

type Entry = FileSystemEntry & {
  isFile: boolean;
  isDirectory: boolean;
};

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: Entry, out: File[]): Promise<void> {
  if (entry.isFile) {
    out.push(await entryFile(entry as FileSystemFileEntry));
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries devolve em blocos (100 no Chrome); repete até esvaziar.
    for (;;) {
      const batch = await readEntries(reader);
      if (batch.length === 0) break;
      for (const child of batch) await walk(child as Entry, out);
    }
  }
}

/** Todos os arquivos de um drop, inclusive dentro de subpastas. */
export async function collectFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) return Array.from(dt.files ?? []);
  const out: File[] = [];
  for (const entry of entries) await walk(entry as Entry, out);
  return out;
}
