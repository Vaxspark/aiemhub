import { readJsonFile, writeJsonFile } from "./fs-util.js";
import * as paths from "./paths.js";

export interface Profile {
  name: string;
  description?: string;
  skills: string[];
  mcp_servers: string[];
}

interface ProfilesFile {
  active?: string;
  profiles: Record<string, Profile>;
}

export class ProfileStore {
  private data: ProfilesFile;

  constructor(data: ProfilesFile) {
    this.data = data;
  }

  static load(): ProfileStore {
    const data = readJsonFile<ProfilesFile>(paths.profilesFile(), { profiles: {} });
    return new ProfileStore(data);
  }

  save(): void {
    paths.ensureLayout();
    writeJsonFile(paths.profilesFile(), this.data);
  }

  list(): Profile[] {
    return Object.values(this.data.profiles);
  }

  get(name: string): Profile | undefined {
    return this.data.profiles[name];
  }

  upsert(p: Profile): void {
    this.data.profiles[p.name] = p;
  }

  remove(name: string): void {
    if (!this.data.profiles[name]) throw new Error(`profile ${name} not found`);
    delete this.data.profiles[name];
    if (this.data.active === name) this.data.active = undefined;
  }

  activeName(): string | undefined {
    return this.data.active;
  }

  active(): Profile | undefined {
    return this.data.active ? this.data.profiles[this.data.active] : undefined;
  }

  setActive(name: string | null): void {
    if (name === null) {
      this.data.active = undefined;
      return;
    }
    if (!this.data.profiles[name]) throw new Error(`profile ${name} not found`);
    this.data.active = name;
  }
}
