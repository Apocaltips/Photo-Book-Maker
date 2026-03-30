import { File, Paths } from "expo-file-system";

type StorageRecord = Record<string, string>;

const storageFile = new File(Paths.document, "photo-book-maker-store.json");

let cachedStore: StorageRecord | null = null;

function normalizeStore(value: unknown): StorageRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

async function readStore(): Promise<StorageRecord> {
  if (cachedStore) {
    return cachedStore;
  }

  try {
    if (!storageFile.exists) {
      cachedStore = {};
      return cachedStore;
    }

    const contents = await storageFile.text();
    cachedStore = contents ? normalizeStore(JSON.parse(contents)) : {};
    return cachedStore;
  } catch {
    cachedStore = {};
    return cachedStore;
  }
}

async function writeStore(nextStore: StorageRecord) {
  cachedStore = nextStore;

  if (!storageFile.exists) {
    storageFile.create({ intermediates: true, overwrite: true });
  }

  storageFile.write(JSON.stringify(nextStore), {
    encoding: "utf8",
  });
}

export const localStorage = {
  async getItem(key: string) {
    const store = await readStore();
    return store[key] ?? null;
  },
  async setItem(key: string, value: string) {
    const store = await readStore();
    await writeStore({
      ...store,
      [key]: value,
    });
  },
  async removeItem(key: string) {
    const store = await readStore();
    if (!(key in store)) {
      return;
    }

    const nextStore = { ...store };
    delete nextStore[key];
    await writeStore(nextStore);
  },
};
