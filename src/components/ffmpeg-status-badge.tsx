// SPDX-License-Identifier: MPL-2.0
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { checkFfmpegStatus, type FfmpegStatus } from "@/lib/ffmpeg";

type State =
  | { kind: "loading" }
  | { kind: "ready"; status: FfmpegStatus }
  | { kind: "error"; message: string };

/**
 * Affiche une alerte discrète dans la barre supérieure uniquement si FFmpeg
 * ou FFprobe est absent ou indisponible.
 */
export function FfmpegStatusBadge() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    checkFfmpegStatus()
      .then((status) => !cancelled && setState({ kind: "ready", status }))
      .catch((error) => !cancelled && setState({ kind: "error", message: String(error) }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return null;
  }

  if (state.kind === "error") {
    return (
      <Tooltip essential>
        <TooltipTrigger asChild>
          <Badge tabIndex={0} variant="destructive">
            <CircleAlert />
            Erreur FFmpeg
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{state.message}</TooltipContent>
      </Tooltip>
    );
  }

  const { status } = state;
  if (status.ffmpegAvailable && status.ffprobeAvailable) {
    return null;
  }

  const missing = [
    !status.ffmpegAvailable && "ffmpeg",
    !status.ffprobeAvailable && "ffprobe",
  ].filter(Boolean);

  return (
    <Tooltip essential>
      <TooltipTrigger asChild>
        <Badge tabIndex={0} className="bg-amber-500 text-black">
          <CircleAlert />
          {missing.join(" et ")} manquant{missing.length > 1 ? "s" : ""}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="space-y-1">
          <p>{status.ffmpegVersion ?? "ffmpeg : introuvable"}</p>
          <p>{status.ffprobeVersion ?? "ffprobe : introuvable"}</p>
          <p>
            Vérifiez le dossier <code>bin/</code> de NeoMeca ou ajoutez{" "}
            <code>ffmpeg</code> et <code>ffprobe</code> au PATH, puis relancez
            l&apos;application.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
