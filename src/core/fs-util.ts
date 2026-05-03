import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export function stripUtf8Bom(buf: Buffer): Buffer {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3);
  }
  return buf;
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const buf = stripUtf8Bom(fs.readFileSync(filePath));
  return JSON.parse(buf.toString("utf-8"));
}

export function atomicWrite(filePath: string, data: string | Buffer): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

export function writeJsonFile(filePath: string, data: unknown): void {
  atomicWrite(filePath, JSON.stringify(data, null, 2));
}

export function removePath(p: string): void {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function hashDir(dirPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(dirPath)) return result;
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) result[rel] = hashFile(full);
    }
  };
  walk(dirPath, "");
  return result;
}
