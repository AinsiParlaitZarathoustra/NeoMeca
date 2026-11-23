// SPDX-License-Identifier: MPL-2.0

/** Version applicative intégrée aux binaires et installeurs (sans préfixe v.). */
export const APP_VERSION = "26.11.23";

export interface ExamModeSessionState {
  examMode: boolean;
  helpOpen: boolean;
}

/** Crée l'état initial de session : mode examen inactif au démarrage. */
export function createInitialExamModeState(): ExamModeSessionState {
  return { examMode: false, helpOpen: false };
}

/** Active irréversiblement le mode examen pour la session et ferme l'aide. */
export function activateExamModeSession(): ExamModeSessionState {
  return { examMode: true, helpOpen: false };
}

/** Indique si l'ouverture du menu Aide est autorisée. */
export function canOpenHelp(examMode: boolean): boolean {
  return !examMode;
}

/** Détermine si une infobulle non essentielle doit être masquée en mode examen. */
export function shouldSuppressTooltip(examMode: boolean, essential = false): boolean {
  return examMode && !essential;
}

/** Indique si la frappe clavier correspond à un raccourci navigateur d'actualisation (F5, Ctrl+R). */
export function isBrowserReloadKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  if (event.key === "F5") return true;
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "r";
}

