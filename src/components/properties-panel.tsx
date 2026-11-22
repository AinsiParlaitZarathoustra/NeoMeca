// SPDX-License-Identifier: MPL-2.0
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDecimal, formatFileSize, type VideoMetadata } from "@/lib/video";

interface PropertiesPanelProps {
  metadata: VideoMetadata | null;
  displayScale: number;
}

/** Onglet Propriétés : affiche les caractéristiques techniques de la vidéo ouverte. */
export function PropertiesPanel({ metadata, displayScale }: PropertiesPanelProps) {
  if (!metadata) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Propriétés de la vidéo</CardTitle>
          <CardDescription>
            Ouvrez une vidéo pour afficher sa taille, sa durée, le nombre total
            d&apos;images, sa fréquence et ses dimensions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows = [
    {
      label: "Nom du fichier",
      value: (
        <Tooltip essential>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="block max-w-[175px] truncate font-medium">
              {metadata.fileName}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs break-all">{metadata.path}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      label: "Taille",
      value: formatFileSize(metadata.fileSizeBytes),
    },
    {
      label: "Nombre d'images",
      value: metadata.totalFrames.toLocaleString("fr-FR"),
    },
    {
      label: "Durée totale",
      value: `${formatDecimal(metadata.durationSecs, 3)} s`,
    },
    {
      label: "Fréquence d'images",
      value: `${formatDecimal(metadata.fps, 2)} img/s`,
    },
    {
      label: "Période par image",
      value: `${formatDecimal(metadata.frameDurationSecs, 4)} s`,
    },
    {
      label: "Dimensions d'origine",
      value: `${metadata.width} × ${metadata.height} px`,
    },
    {
      label: "Codec vidéo",
      value: metadata.codecLongName ? (
        <Tooltip essential>
          <TooltipTrigger asChild>
            <Badge tabIndex={0} variant="secondary">
              {metadata.codecName}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{metadata.codecLongName}</TooltipContent>
        </Tooltip>
      ) : (
        <Badge variant="secondary">{metadata.codecName}</Badge>
      ),
    },
    {
      label: "Facteur d'affichage",
      value: `${Math.round(displayScale * 100)} %`,
    },
  ];

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-base">Propriétés du clip</CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        <Table>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="text-xs text-muted-foreground">{row.label}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {row.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
