// SPDX-License-Identifier: MPL-2.0
import {
  BookOpen,
  CircleHelp,
  Crosshair,
  FolderOpen,
  Info,
  Keyboard,
  LineChart,
  Ruler,
  Scale,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_VERSION } from "@/lib/exam-mode";

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  {
    keyLabel: "Flèche droite / Flèche gauche",
    action: "Image suivante / Image précédente",
  },
  {
    keyLabel: "Espace",
    action: "Lecture / Pause de la vidéo",
  },
  {
    keyLabel: "Molette de la souris (sur la vidéo)",
    action: "Zoomer / Dézoomer",
  },
  {
    keyLabel: "Switch Loupe",
    action: "Loupe de précision ×4 autour du curseur",
  },
  {
    keyLabel: "Ctrl + Z / Ctrl + Y",
    action: "Annuler / Rétablir le dernier pointage",
  },
  {
    keyLabel: "Échap",
    action: "Quitter l'outil de sélection en cours",
  },
] as const;

/** Fenêtre d'aide intégrée à 3 onglets : Bien démarrer, Outils et raccourcis, À propos. */
export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleHelp className="size-4" />
            Aide de NeoMeca
          </DialogTitle>
          <DialogDescription>
            Prise en main rapide, raccourcis clavier et informations sur l&apos;application.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="getting-started" className="min-h-0 flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="getting-started">
              <BookOpen className="size-3.5" />
              Bien démarrer
            </TabsTrigger>
            <TabsTrigger value="shortcuts">
              <Keyboard className="size-3.5" />
              Outils et raccourcis
            </TabsTrigger>
            <TabsTrigger value="about">
              <Info className="size-3.5" />
              À propos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="getting-started" className="space-y-3 overflow-y-auto pr-1 pt-2">
            <p className="text-sm text-muted-foreground">
              Bienvenue dans NeoMeca. L&apos;objectif est simple : transformer une vidéo
              de mouvement en mesures fiables et en courbes exploitables, sans prise de
              tête. Suivez ces 4 étapes dans l&apos;ordre.
            </p>

            <Card className="gap-2 py-3">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FolderOpen className="size-4 text-primary" />
                  1. Ouvrir votre vidéo
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-sm text-muted-foreground">
                Cliquez sur <strong>Ouvrir une vidéo</strong> en haut à gauche et
                choisissez votre fichier (MP4, MOV, AVI, MKV ou WebM). Une fois chargée,
                vous pouvez avancer ou reculer image par image avec les flèches du clavier.
              </CardContent>
            </Card>

            <Card className="gap-2 py-3">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Ruler className="size-4 text-primary" />
                  2. Comment étalonner ? (Donner l&apos;échelle et le repère)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 text-sm text-muted-foreground">
                <p>
                  Pour que l&apos;ordinateur connaisse les vraies distances en mètres,
                  ouvrez l&apos;onglet <strong>Étalonnage</strong> :
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Cliquez sur <strong>Placer P1</strong> puis <strong>Placer P2</strong>{" "}
                    aux deux extrémités d&apos;un objet de taille connue visible sur la
                    vidéo (une règle, un banc, une table), puis indiquez sa longueur réelle
                    en mètres.
                  </li>
                  <li>
                    Cliquez sur <strong>Placer l&apos;origine (O)</strong> là où vous
                    voulez fixer le point (0 ; 0), et choisissez le sens positif des axes X
                    et Y.
                  </li>
                  <li>
                    Si besoin, placez-vous sur l&apos;image de départ et cliquez sur{" "}
                    <strong>Définir l&apos;image courante (t = 0)</strong>. Astuce :
                    activez la <strong>Loupe</strong> pour viser au pixel près !
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="gap-2 py-3">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Crosshair className="size-4 text-primary" />
                  3. Comment pointer ? (Suivre le mouvement)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 text-sm text-muted-foreground">
                <p>
                  Ouvrez l&apos;onglet <strong>Pointage</strong> et activez le mode
                  pointage :
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Cliquez simplement sur l&apos;objet à suivre : le point est enregistré
                    et la vidéo passe automatiquement à l&apos;image suivante.
                  </li>
                  <li>
                    Vous suivez plusieurs objets en même temps (collision, pendule) ?
                    Réglez <strong>Points par image</strong> jusqu&apos;à 9 points.
                  </li>
                  <li>
                    Une erreur de clic ? Pas de panique : <strong>Ctrl+Z</strong> annule
                    le dernier point.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="gap-2 py-3">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <LineChart className="size-4 text-primary" />
                  4. Comment exploiter les données ? (Courbes et exports)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-4 text-sm text-muted-foreground">
                <p>
                  Dès que vous avez quelques points, NeoMeca calcule automatiquement les
                  vitesses, les accélérations et même les énergies (si vous indiquez la
                  masse).
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Ouvrez l&apos;onglet <strong>Analyse</strong> pour tracer vos courbes
                    et tester une modélisation.
                  </li>
                  <li>
                    Cliquez sur <strong>Exporter</strong> pour enregistrer un fichier Excel
                    (.xlsx), un CSV, un fichier Regressi (.rw3), ou copier le tableau
                    directement dans le presse-papier.
                  </li>
                  <li>
                    Pensez à <strong>Enregistrer le projet (.neomeca.json)</strong> si vous
                    voulez reprendre votre séance plus tard.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shortcuts" className="overflow-y-auto pt-2">
            <Card className="py-2">
              <CardContent className="px-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[45%]">Raccourci ou outil</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SHORTCUTS.map((item) => (
                      <TableRow key={item.keyLabel}>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {item.keyLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{item.action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="about" className="overflow-y-auto pt-2">
            <Card>
              <CardContent className="space-y-4 pt-2">
                <div className="flex items-center gap-4">
                  <img
                    src="/favicon.png"
                    alt="Logo officiel NeoMeca"
                    className="size-16 shrink-0 rounded-lg border bg-muted/30 p-1"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">NeoMeca</h3>
                      <Badge variant="outline" className="font-mono">
                        {APP_VERSION}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Remplaçant moderne d&apos;AviMéca : pointage vidéo et analyse
                      mécanique pour la physique-chimie.
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono font-medium">{APP_VERSION}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Scale className="size-3.5" />
                      Licence
                    </span>
                    <span className="font-medium">
                      Mozilla Public License 2.0 (MPL-2.0)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
