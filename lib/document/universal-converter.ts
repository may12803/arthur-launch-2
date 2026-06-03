// universal-converter.ts — TypeScript port of ~/arthur/lib/document/universal-converter.js
// for use by app/api/chat/route.ts multimodal fast path. Requires pandoc + ffmpeg
// + unzip in the runtime container (see Dockerfile). Whisper is HTTP via Groq.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const execFileP = promisify(execFile);

const MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
const MAX_VIDEO_FRAMES = 3;
const PANDOC = "/usr/bin/pandoc";
const FFMPEG = "/usr/bin/ffmpeg";
const UNZIP = "/usr/bin/unzip";

export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export type ConvertResult = { blocks: AnthropicBlock[]; notes: string[]; kind: string };

function extname(name: string): string {
  const m = (name || "").match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

export function classify(fileName: string, mimeType: string): string {
  const ext = extname(fileName);
  const m = (mimeType || "").toLowerCase();
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/") || ["png","jpg","jpeg","webp","gif","heic","heif","bmp","tiff"].includes(ext)) return "image";
  if (["docx","odt","rtf","epub","tex","mediawiki","wiki"].includes(ext) ||
      /(officedocument\.wordprocessingml|opendocument\.text|rtf|epub)/.test(m)) return "office-text";
  if (["xlsx","xls","xlsm","xlsb","ods","csv","tsv"].includes(ext) ||
      /(spreadsheetml|opendocument\.spreadsheet|excel)/.test(m)) return "spreadsheet";
  if (["pptx","ppt","odp"].includes(ext) || /(presentationml|opendocument\.presentation|powerpoint)/.test(m)) return "pptx";
  if (m.startsWith("audio/") || ["mp3","m4a","wav","ogg","flac","opus","aac","wma"].includes(ext)) return "audio";
  if (m.startsWith("video/") || ["mp4","mov","mkv","webm","avi","m4v","flv","wmv"].includes(ext)) return "video";
  if (["zip","tar","gz","tgz","bz2","7z","rar"].includes(ext) || /(zip|x-tar|gzip)/.test(m)) return "archive";
  if (m.startsWith("text/") || /(json|xml|yaml|markdown|javascript|typescript|x-(python|sh|sql))/.test(m)) return "text";
  if (["txt","md","markdown","log","env","conf","cfg","ini","toml","lock",
       "js","mjs","cjs","ts","tsx","jsx","py","rb","go","rs","java","kt","swift","cs","cpp","c","h","hpp","hxx","php","sh","bash","zsh","fish",
       "sql","graphql","gql","proto","yaml","yml","json","xml","html","htm","css","scss","sass","less","vue","svelte","astro"].includes(ext)) return "text";
  return "unknown";
}

async function withTempFile<T>(buffer: Buffer, suffix: string, fn: (p: string) => Promise<T>): Promise<T> {
  const tmp = join(tmpdir(), "udc-" + randomBytes(6).toString("hex") + (suffix ? "." + suffix : ""));
  await fs.writeFile(tmp, buffer);
  try { return await fn(tmp); }
  finally { try { await fs.unlink(tmp); } catch {} }
}

async function pandocToMarkdown(buffer: Buffer, ext: string): Promise<string> {
  return withTempFile(buffer, ext, async (tmp) => {
    const { stdout } = await execFileP(PANDOC, ["-f", ext === "epub" ? "epub" : ext, "-t", "markdown_strict", tmp], { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 });
    return stdout;
  });
}

async function xlsxToCsvSheets(buffer: Buffer): Promise<string> {
  // Dynamic import so the route bundles xlsx only when needed
  const XLSX: any = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { rawNumbers: false, dateNF: "yyyy-mm-dd" });
    out.push("### Sheet: " + name + "\n\n" + csv.trim());
  }
  return out.join("\n\n---\n\n");
}

async function pptxToText(buffer: Buffer): Promise<string> {
  return withTempFile(buffer, "pptx", async (tmp) => {
    const dir = join(tmpdir(), "pptx-" + randomBytes(6).toString("hex"));
    await fs.mkdir(dir, { recursive: true });
    try {
      await execFileP(UNZIP, ["-qo", tmp, "-d", dir], { timeout: 30_000 });
      const slidesDir = join(dir, "ppt", "slides");
      let entries: string[] = [];
      try { entries = (await fs.readdir(slidesDir)).filter(f => /^slide\d+\.xml$/.test(f)); } catch {}
      entries.sort((a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));
      const slides: string[] = [];
      for (const f of entries) {
        const xml = await fs.readFile(join(slidesDir, f), "utf8");
        const runs = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map(m => m[1].trim()).filter(Boolean);
        const num = f.match(/\d+/)![0];
        slides.push("### Slide " + num + "\n" + runs.join("\n"));
      }
      return slides.join("\n\n");
    } finally {
      try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
    }
  });
}

async function audioToTranscript(buffer: Buffer, fileName: string): Promise<string> {
  // Groq Whisper turbo via HTTP (same shape as ~/arthur/lib/audio/whisper.js)
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const boundary = "----ArthurUDC-" + randomBytes(8).toString("hex");
  const parts: Buffer[] = [];
  function addField(name: string, value: string) {
    parts.push(Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n"));
  }
  function addFile(name: string, filename: string, ct: string, data: Buffer) {
    parts.push(Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\nContent-Type: " + ct + "\r\n\r\n"));
    parts.push(data);
    parts.push(Buffer.from("\r\n"));
  }
  addField("model", "whisper-large-v3-turbo");
  addField("response_format", "text");
  addFile("file", fileName, "application/octet-stream", buffer);
  parts.push(Buffer.from("--" + boundary + "--\r\n"));
  const body = Buffer.concat(parts);
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "multipart/form-data; boundary=" + boundary,
    },
    body,
  });
  if (!r.ok) throw new Error("Groq Whisper HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
  const text = await r.text();
  return text.trim();
}

async function videoToFramesAndTranscript(buffer: Buffer, fileName: string): Promise<{ frames: { ts: number; data: string; mediaType: string }[]; duration: number; transcript: string }> {
  return withTempFile(buffer, extname(fileName) || "mp4", async (tmp) => {
    const probeOut = await execFileP(FFMPEG, ["-i", tmp, "-hide_banner"], { timeout: 15_000 }).catch((e: any) => ({ stdout: "", stderr: e.stderr || "" }));
    const dm = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probeOut.stderr || "");
    const duration = dm ? (parseInt(dm[1], 10) * 3600 + parseInt(dm[2], 10) * 60 + parseFloat(dm[3])) : 0;
    const frameDir = join(tmpdir(), "vf-" + randomBytes(6).toString("hex"));
    await fs.mkdir(frameDir, { recursive: true });
    const frames: { ts: number; data: string; mediaType: string }[] = [];
    try {
      for (let i = 0; i < MAX_VIDEO_FRAMES; i++) {
        const ts = duration > 0 ? (duration * (i + 1)) / (MAX_VIDEO_FRAMES + 1) : i * 2;
        const out = join(frameDir, "f" + i + ".jpg");
        await execFileP(FFMPEG, ["-y", "-ss", String(ts), "-i", tmp, "-frames:v", "1", "-q:v", "4", out], { timeout: 20_000 }).catch(() => {});
        try {
          const buf = await fs.readFile(out);
          if (buf.length > 1024) frames.push({ ts, data: buf.toString("base64"), mediaType: "image/jpeg" });
        } catch {}
      }
      const audioOut = join(frameDir, "a.m4a");
      let transcript = "";
      await execFileP(FFMPEG, ["-y", "-i", tmp, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "64k", audioOut], { timeout: 60_000 }).catch(() => {});
      try {
        const aBuf = await fs.readFile(audioOut);
        if (aBuf.length > 4096) {
          try { transcript = await audioToTranscript(aBuf, "video-audio.m4a"); }
          catch (e: any) { transcript = "(audio transcript failed: " + (e.message || "").slice(0, 100) + ")"; }
        }
      } catch {}
      return { frames, duration, transcript };
    } finally {
      try { await fs.rm(frameDir, { recursive: true, force: true }); } catch {}
    }
  });
}

export async function convertToAnthropicContent(buffer: Buffer, fileName: string, mimeType: string): Promise<ConvertResult> {
  if (!Buffer.isBuffer(buffer)) throw new Error("buffer must be a Buffer");
  if (buffer.length > MAX_BUFFER_BYTES) {
    throw new Error("buffer is " + Math.round(buffer.length / 1024 / 1024) + " MB - over the " + (MAX_BUFFER_BYTES / 1024 / 1024) + " MB cap");
  }
  const kind = classify(fileName, mimeType);
  const blocks: AnthropicBlock[] = [];
  const notes: string[] = [];

  switch (kind) {
    case "pdf":
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } });
      notes.push("PDF: native Anthropic document reading");
      break;
    case "image":
      blocks.push({ type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: buffer.toString("base64") } });
      notes.push("Image: Anthropic vision");
      break;
    case "text": {
      const text = buffer.toString("utf8").slice(0, MAX_TEXT_CHARS);
      blocks.push({ type: "text", text: "<document name=\"" + fileName + "\" mime=\"" + (mimeType || "text/plain") + "\" size_bytes=\"" + buffer.length + "\">\n" + text + "\n</document>" });
      notes.push("Text: utf-8 decode");
      break;
    }
    case "office-text": {
      const md = await pandocToMarkdown(buffer, extname(fileName));
      blocks.push({ type: "text", text: "<document name=\"" + fileName + "\" mime=\"" + mimeType + "\" via=\"pandoc\" format=\"markdown\">\n" + md.slice(0, MAX_TEXT_CHARS) + "\n</document>" });
      notes.push("Office text -> markdown via pandoc (" + md.length + " chars)");
      break;
    }
    case "spreadsheet": {
      const csv = await xlsxToCsvSheets(buffer);
      blocks.push({ type: "text", text: "<spreadsheet name=\"" + fileName + "\" mime=\"" + mimeType + "\" via=\"xlsx-lib\" format=\"csv-per-sheet\">\n" + csv.slice(0, MAX_TEXT_CHARS) + "\n</spreadsheet>" });
      notes.push("Spreadsheet -> CSV via xlsx (" + csv.length + " chars)");
      break;
    }
    case "pptx": {
      const text = await pptxToText(buffer);
      blocks.push({ type: "text", text: "<presentation name=\"" + fileName + "\" mime=\"" + mimeType + "\" via=\"pptx-xml-extract\">\n" + text.slice(0, MAX_TEXT_CHARS) + "\n</presentation>" });
      notes.push("PPTX -> slide text via XML extract (" + text.length + " chars)");
      break;
    }
    case "audio": {
      const transcript = await audioToTranscript(buffer, fileName);
      blocks.push({ type: "text", text: "<audio name=\"" + fileName + "\" mime=\"" + mimeType + "\" via=\"whisper-groq-turbo\">\n" + transcript.slice(0, MAX_TEXT_CHARS) + "\n</audio>" });
      notes.push("Audio -> Whisper transcript (" + transcript.length + " chars)");
      break;
    }
    case "video": {
      const { frames, duration, transcript } = await videoToFramesAndTranscript(buffer, fileName);
      for (let i = 0; i < frames.length; i++) {
        blocks.push({ type: "image", source: { type: "base64", media_type: frames[i].mediaType, data: frames[i].data } });
      }
      blocks.push({ type: "text", text: "<video name=\"" + fileName + "\" mime=\"" + mimeType + "\" duration_sec=\"" + duration.toFixed(1) + "\" via=\"ffmpeg+whisper\" frames=\"" + frames.length + "\">\n" + transcript.slice(0, MAX_TEXT_CHARS) + "\n</video>" });
      notes.push("Video -> " + frames.length + " frames + Whisper transcript (" + transcript.length + " chars)");
      break;
    }
    case "archive":
      throw new Error("archive files (zip/tar/gz) are not yet supported - extract and resend");
    default:
      throw new Error("unsupported file type: " + fileName + " (mime=" + mimeType + ")");
  }
  return { blocks, notes, kind };
}
