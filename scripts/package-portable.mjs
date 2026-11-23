// SPDX-License-Identifier: MPL-2.0
// Script d'empaquetage de l'archive portable (.zip) pour Windows et Linux.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Analyse les arguments CLI (--platform, --out-dir, --version, --require-ffmpeg). */
function parseArgs(argv) {
  const result = {
    platform: process.platform === "win32" ? "windows" : "linux",
    outDir: path.join(ROOT, "dist-release"),
    version: null,
    requireFfmpeg: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--platform" && argv[i + 1]) {
      result.platform = argv[++i];
    } else if (arg === "--out-dir" && argv[i + 1]) {
      result.outDir = path.resolve(argv[++i]);
    } else if (arg === "--version" && argv[i + 1]) {
      result.version = argv[++i].trim() || null;
    } else if (arg === "--require-ffmpeg") {
      result.requireFfmpeg = true;
    }
  }
  return result;
}

/** Lit la version intégrée configurée dans src-tauri/tauri.conf.json. */
function readAppVersion() {
  const confPath = path.join(ROOT, "src-tauri", "tauri.conf.json");
  const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
  if (typeof conf.version !== "string" || !conf.version.trim()) {
    throw new Error("Version introuvable dans src-tauri/tauri.conf.json.");
  }
  return conf.version.trim();
}

/** Recherche le binaire release compilé selon la plateforme cible. */
function resolveBinary(platform) {
  const releaseDir = path.join(ROOT, "src-tauri", "target", "release");
  const candidates =
    platform === "windows"
      ? ["NeoMeca.exe", "neomeca2.exe", "neomeca.exe"]
      : ["neomeca", "neomeca2", "NeoMeca"];

  for (const name of candidates) {
    const full = path.join(releaseDir, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return full;
    }
  }
  throw new Error(
    `Binaire release introuvable dans ${releaseDir} (attendu : ${candidates.join(", ")}).`,
  );
}

/** Recherche les binaires FFmpeg et FFprobe embarqués pour la plateforme cible. */
function resolveSidecarTools(platform) {
  const ext = platform === "windows" ? ".exe" : "";
  const triple =
    platform === "windows" ? "x86_64-pc-windows-msvc" : "x86_64-unknown-linux-gnu";
  const resolved = {};

  for (const tool of ["ffmpeg", "ffprobe"]) {
    const candidates = [
      path.join(ROOT, "src-tauri", "bin", `${tool}${ext}`),
      path.join(ROOT, "src-tauri", "target", "release", "bin", `${tool}${ext}`),
      path.join(ROOT, "src-tauri", "binaries", `${tool}-${triple}${ext}`),
      path.join(ROOT, "src-tauri", "target", "release", `${tool}${ext}`),
    ];
    const match = candidates.find(
      (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    if (match) {
      resolved[`${tool}${ext}`] = match;
    }
  }

  return resolved;
}

/** Compresse le répertoire temporaire en archive .zip portable. */
function createZipArchive(stagingDir, zipPath, platform) {
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }
  if (platform === "windows") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -Path '${stagingDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
  } else {
    execFileSync("zip", ["-r", "-q", zipPath, "."], {
      cwd: stagingDir,
      stdio: "inherit",
    });
  }
}

/** Point d'entrée : prépare le dossier portable autonome (binaire, bin/ FFmpeg, notices et docs). */
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.platform !== "windows" && args.platform !== "linux") {
    throw new Error(`Plateforme non prise en charge : ${args.platform}`);
  }

  const version = args.version ?? readAppVersion();
  const binarySrc = resolveBinary(args.platform);
  const sidecarTools = resolveSidecarTools(args.platform);
  const expectedCount = 2;
  if (Object.keys(sidecarTools).length < expectedCount) {
    const message =
      "Binaires FFmpeg / FFprobe embarqués introuvables dans src-tauri/bin/ (exécutez scripts/build-ffmpeg-minimal.sh).";
    if (args.requireFfmpeg) {
      throw new Error(message);
    }
    console.warn(`Avertissement : ${message}`);
  }

  const targetBinName = args.platform === "windows" ? "NeoMeca.exe" : "neomeca";
  const zipName = `NeoMeca_${version}_${args.platform}_x64.zip`;

  fs.mkdirSync(args.outDir, { recursive: true });
  const stagingDir = fs.mkdtempSync(path.join(args.outDir, ".staging-"));

  try {
    const destBinary = path.join(stagingDir, targetBinName);
    fs.copyFileSync(binarySrc, destBinary);
    if (args.platform === "linux") {
      fs.chmodSync(destBinary, 0o755);
    }

    if (Object.keys(sidecarTools).length > 0) {
      const stagingBinDir = path.join(stagingDir, "bin");
      fs.mkdirSync(stagingBinDir, { recursive: true });
      for (const [fileName, srcPath] of Object.entries(sidecarTools)) {
        const destPath = path.join(stagingBinDir, fileName);
        fs.copyFileSync(srcPath, destPath);
        if (args.platform === "linux") {
          fs.chmodSync(destPath, 0o755);
        }
      }
    }

    for (const docFile of ["LICENSE", "THIRD_PARTY_NOTICES.txt", "README.md"]) {
      const src = path.join(ROOT, docFile);
      if (!fs.existsSync(src)) {
        throw new Error(`Fichier obligatoire manquant : ${docFile}`);
      }
      fs.copyFileSync(src, path.join(stagingDir, docFile));
    }

    const zipPath = path.join(args.outDir, zipName);
    createZipArchive(stagingDir, zipPath, args.platform);
    const sizeBytes = fs.statSync(zipPath).size;
    console.log(`Archive portable créée : ${zipPath} (${sizeBytes} octets)`);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

main();
