// SPDX-License-Identifier: MPL-2.0
import { CircleHelp, Lock, Moon, Settings, ShieldAlert, Sun } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { Theme } from "@/hooks/use-theme";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  examMode: boolean;
  onActivateExamMode: () => void;
  onOpenHelp: () => void;
}

/** Dialogue Paramètres : mode examen, accès à l'aide et apparence. */
export function SettingsDialog({
  open,
  onOpenChange,
  theme,
  onThemeChange,
  examMode,
  onActivateExamMode,
  onOpenHelp,
}: SettingsDialogProps) {
  const [confirmExamOpen, setConfirmExamOpen] = useState(false);

  const handleExamSwitchChange = (checked: boolean) => {
    if (examMode || !checked) return;
    setConfirmExamOpen(true);
  };

  const handleConfirmExamMode = () => {
    setConfirmExamOpen(false);
    onActivateExamMode();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="size-4" />
              Paramètres
            </DialogTitle>
            <DialogDescription>
              Configurez le mode examen, consultez l&apos;aide intégrée ou changez le thème.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Section Mode examen */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="exam-mode-switch" className="text-sm font-medium">
                      Mode examen
                    </Label>
                    {examMode && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="size-3" />
                        Verrouillé
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {examMode
                      ? "Mode examen actif. Redémarrez NeoMeca pour le désactiver."
                      : "Désactive l'accès au menu Aide et les infobulles d'aide pendant la session."}
                  </p>
                </div>
                <Switch
                  id="exam-mode-switch"
                  checked={examMode}
                  disabled={examMode}
                  onCheckedChange={handleExamSwitchChange}
                  aria-label="Activer le mode examen"
                />
              </div>
            </section>

            <Separator />

            {/* Section Aide */}
            <section className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-sm font-medium">Aide intégrée</span>
                <p className="text-xs text-muted-foreground">
                  {examMode
                    ? "Indisponible tant que le mode examen est actif."
                    : "Guide de démarrage, raccourcis clavier et informations."}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={examMode}
                onClick={() => {
                  onOpenChange(false);
                  onOpenHelp();
                }}
              >
                <CircleHelp />
                Ouvrir l&apos;aide
              </Button>
            </section>

            <Separator />

            {/* Section Apparence */}
            <section className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-sm font-medium">Apparence</span>
                <p className="text-xs text-muted-foreground">
                  Choisissez entre le thème clair et le thème sombre.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={theme === "light" ? "default" : "outline"}
                  onClick={() => onThemeChange("light")}
                >
                  <Sun />
                  Clair
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={theme === "dark" ? "default" : "outline"}
                  onClick={() => onThemeChange("dark")}
                >
                  <Moon />
                  Sombre
                </Button>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmExamOpen} onOpenChange={setConfirmExamOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-destructive" />
              Activer le mode examen ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vous allez activer le mode examen qui empêche les élèves d&apos;accéder au
              menu &quot;Aide&quot;. Cette action est irréversible. L&apos;annuler
              nécessite le redémarrage de NéoMeca.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-black bg-black text-white hover:bg-black/90 hover:text-white dark:border-black dark:bg-black dark:text-white dark:hover:bg-black/90">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmExamMode}>
              Continuer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
