// SPDX-License-Identifier: MPL-2.0
import { createContext, useContext } from "react";

const ExamModeContext = createContext(false);

export const ExamModeProvider = ExamModeContext.Provider;

/** Retourne vrai lorsque le mode examen est actif pour la session courante. */
export function useExamMode(): boolean {
  return useContext(ExamModeContext);
}
