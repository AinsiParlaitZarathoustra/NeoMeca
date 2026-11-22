// SPDX-License-Identifier: MPL-2.0
// Script d'empaquetage de l'archive portable (.zip) pour Windows et Linux.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Analyse les arguments CLI (--platform, --out-dir, --version). */
function parseArgs(argv) {
  const result = {
    platform: process.platform === "win32" ? "windows" : "linux",
    outDir: path.join(ROOT, "dist-release"),
    version: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--platform" && argv[i + 1]) {
      result.platform = argv[++i];
    } else if (arg === "--out-dir" && argv[i + 1]) {
      result.outDir = path.resolve(argv[++i]);
    } else if (arg === "--version" && argv[i + 1]) {
      result.version = argv[++i].trim() || null;
    }
  }
  return result;
}

/** Lit la version CalVer configurée dans src-tauri/tauri.conf.json. */
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

/** Point d'entrée : prépare un dossier sain avec le binaire, LICENSE et README.md puis crée le .zip. */
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.platform !== "windows" && args.platform !== "linux") {
    throw new Error(`Plateforme non prise en charge : ${args.platform}`);
  }

  const version = args.version ?? readAppVersion();
  const binarySrc = resolveBinary(args.platform);
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

    for (const docFile of ["LICENSE", "README.md"]) {
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
