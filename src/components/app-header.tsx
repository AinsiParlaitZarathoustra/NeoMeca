// SPDX-License-Identifier: MPL-2.0
import {
  Download,
  FolderKanban,
  FolderOpen,
  Lock,
  Moon,
  Save,
  Settings,
  Sun,
} from "lucide-react";
import { FfmpegStatusBadge } from "@/components/ffmpeg-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Theme } from "@/hooks/use-theme";

interface AppHeaderProps {
  theme: Theme;
  examMode: boolean;
  isOpening?: boolean;
  canSaveProject: boolean;
  canExport: boolean;
  onToggleTheme: () => void;
  onOpenVideo: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onOpenExport: () => void;
  onOpenSettings: () => void;
}

/** Barre supérieure : vidéo, projet, export, alerte FFmpeg, mode examen, thème et paramètres. */
export function AppHeader({
  theme,
  examMode,
  isOpening = false,
  canSaveProject,
  canExport,
  onToggleTheme,
  onOpenVideo,
  onOpenProject,
  onSaveProject,
  onOpenExport,
  onOpenSettings,
}: AppHeaderProps) {
  const isDark = theme === "dark";
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <Button size="sm" onClick={onOpenVideo} disabled={isOpening}>
        <FolderOpen />
        Ouvrir une vidéo
      </Button>

      <Separator orientation="vertical" className="h-6!" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="outline" onClick={onOpenProject} disabled={isOpening}>
            <FolderKanban />
            Ouvrir un projet
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ouvrir un projet enregistré</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            onClick={onSaveProject}
            disabled={!canSaveProject || isOpening}
          >
            <Save />
            Enregistrer le projet
          </Button>
        </TooltipTrigger>
        <TooltipContent>Enregistrer la séance en cours</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenExport}
            disabled={!canExport || isOpening}
          >
            <Download />
            Exporter
          </Button>
        </TooltipTrigger>
        <TooltipContent>Exporter les mesures ou l&apos;image</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-2">
        <FfmpegStatusBadge />
        {examMode && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" />
            Mode examen
          </Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onToggleTheme}
              aria-label={isDark ? "Passer au thème clair" : "Passer au thème sombre"}
            >
              {isDark ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isDark ? "Thème clair" : "Thème sombre"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onOpenSettings}>
              <Settings />
              Paramètres
            </Button>
          </TooltipTrigger>
          <TooltipContent>Paramètres, mode examen et aide</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
