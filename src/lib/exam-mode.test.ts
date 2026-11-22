// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  APP_VERSION,
  activateExamModeSession,
  canOpenHelp,
  createInitialExamModeState,
  isBrowserReloadKey,
  shouldSuppressTooltip,
} from "./exam-mode.ts";

test("le mode examen démarre inactif, ferme l'aide et bloque les infobulles non essentielles", () => {
  const initial = createInitialExamModeState();
  assert.equal(initial.examMode, false);
  assert.equal(initial.helpOpen, false);
  assert.equal(canOpenHelp(initial.examMode), true);
  assert.equal(shouldSuppressTooltip(initial.examMode, false), false);

  const locked = activateExamModeSession();
  assert.equal(locked.examMode, true);
  assert.equal(locked.helpOpen, false);
  assert.equal(canOpenHelp(locked.examMode), false);
  assert.equal(shouldSuppressTooltip(locked.examMode, false), true);
  assert.equal(shouldSuppressTooltip(locked.examMode, true), false);
});

test("la version 26.11.22 est cohérente dans package.json, tauri.conf.json, Cargo.toml et l'UI", () => {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
  ) as { version: string };
  const tauriConf = JSON.parse(
    fs.readFileSync(path.join(rootDir, "src-tauri", "tauri.conf.json"), "utf8"),
  ) as {
    version: string;
    bundle?: { windows?: { wix?: { version?: string } } };
  };
  const cargoToml = fs.readFileSync(
    path.join(rootDir, "src-tauri", "Cargo.toml"),
    "utf8",
  );

  assert.equal(APP_VERSION, "26.11.22");
  assert.equal(APP_VERSION.startsWith("v"), false);
  assert.equal(packageJson.version, APP_VERSION);
  assert.equal(tauriConf.version, APP_VERSION);
  assert.equal(tauriConf.bundle?.windows?.wix?.version, APP_VERSION);
  assert.match(cargoToml, /^version = "26\.11\.22"/m);
});

test("isBrowserReloadKey identifie F5 et Ctrl+R / Cmd+R sans bloquer les autres touches", () => {
  assert.equal(
    isBrowserReloadKey({ key: "F5", ctrlKey: false, metaKey: false, altKey: false }),
    true,
  );
  assert.equal(
    isBrowserReloadKey({ key: "r", ctrlKey: true, metaKey: false, altKey: false }),
    true,
  );
  assert.equal(
    isBrowserReloadKey({ key: "R", ctrlKey: false, metaKey: true, altKey: false }),
    true,
  );
  assert.equal(
    isBrowserReloadKey({ key: "z", ctrlKey: true, metaKey: false, altKey: false }),
    false,
  );
});
