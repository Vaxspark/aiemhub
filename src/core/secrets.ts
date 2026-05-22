import * as fs from "fs";
import * as path from "path";
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
let keytarChecked = false;

async function getKeytar() {
  if (!keytarChecked) {
    keytarChecked = true;
    try {
      keytarModule = await import("keytar");
      await keytarModule.findCredentials("aiem-probe");
    } catch {
      keytarModule = null;
    }
  }
  return keytarModule;
}

const SERVICE = "aiem";

function fileVaultPath(): string {
  return path.join(paths.home(), ".vault-store");
}

function loadFileVault(): Record<string, string> {
  const p = fileVaultPath();
  try {
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch { return {}; }
}

function saveFileVault(data: Record<string, string>): void {
  paths.ensureLayout();
  const p = fileVaultPath();
  fs.writeFileSync(p, JSON.stringify(data, null, 2), { mode: 0o600 });
}

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
    let stored = false;
    const kt = await getKeytar();
    if (kt) {
      try {
        await kt.setPassword(SERVICE, name, value);
        stored = true;
      } catch { /* fall through to file vault */ }
    }
    if (!stored) {
      const fv = loadFileVault();
      fv[name] = value;
      saveFileVault(fv);
    }
    this.index.secrets[name] = {
      description,
      updated_at: new Date().toISOString(),
    };
    this.save();
  }

  async get(name: string): Promise<string | null> {
    const kt = await getKeytar();
    if (kt) {
      try {
        const val = await kt.getPassword(SERVICE, name);
        if (val) return val;
      } catch { /* fall through */ }
    }
    const fv = loadFileVault();
    return fv[name] || null;
  }

  async del(name: string): Promise<void> {
    const kt = await getKeytar();
    if (kt) {
      try { await kt.deletePassword(SERVICE, name); } catch {}
    }
    const fv = loadFileVault();
    if (fv[name]) { delete fv[name]; saveFileVault(fv); }
    delete this.index.secrets[name];
    this.save();
  }
}
