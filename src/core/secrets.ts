import { readJsonFile, writeJsonFile } from "./fs-util.js";
import * as paths from "./paths.js";

export interface SecretMeta {
  description?: string;
  updated_at: string;
}

interface SecretIndex {
  secrets: Record<string, SecretMeta>;
}

let keytarModule: any = null;

async function getKeytar() {
  if (keytarModule === null) {
    try {
      keytarModule = await import("keytar");
    } catch {
      keytarModule = false;
    }
  }
  return keytarModule || null;
}

const SERVICE = "aiem";

export class Vault {
  private index: SecretIndex;

  constructor(index: SecretIndex) {
    this.index = index;
  }

  static load(): Vault {
    const data = readJsonFile<SecretIndex>(paths.secretsIndexFile(), { secrets: {} });
    return new Vault(data);
  }

  save(): void {
    paths.ensureLayout();
    writeJsonFile(paths.secretsIndexFile(), this.index);
  }

  names(): string[] {
    return Object.keys(this.index.secrets);
  }

  meta(name: string): SecretMeta | undefined {
    return this.index.secrets[name];
  }

  len(): number {
    return Object.keys(this.index.secrets).length;
  }

  isEmpty(): boolean {
    return this.len() === 0;
  }

  async set(name: string, value: string, description?: string): Promise<void> {
    if (!name || /\s/.test(name)) throw new Error("invalid secret name");
    const kt = await getKeytar();
    if (kt) {
      await kt.setPassword(SERVICE, name, value);
    }
    this.index.secrets[name] = {
      description,
      updated_at: new Date().toISOString(),
    };
    this.save();
  }

  async get(name: string): Promise<string | null> {
    const kt = await getKeytar();
    if (kt) return kt.getPassword(SERVICE, name);
    return null;
  }

  async del(name: string): Promise<void> {
    const kt = await getKeytar();
    if (kt) {
      try { await kt.deletePassword(SERVICE, name); } catch {}
    }
    delete this.index.secrets[name];
    this.save();
  }
}
