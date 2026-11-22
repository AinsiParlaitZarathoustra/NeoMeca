// SPDX-License-Identifier: MPL-2.0
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_POINT_COLORS } from "@/lib/tracking";

export interface ColorPreset {
  value: string;
  label: string;
}

export const BASIC_COLOR_PRESETS: readonly ColorPreset[] = [
  { value: "#22c55e", label: "Vert" },
  { value: "#3b82f6", label: "Bleu" },
  { value: "#f59e0b", label: "Ambre" },
  { value: "#ef4444", label: "Rouge" },
];

const POINT_COLOR_LABELS = [
  "Rouge",
  "Bleu",
  "Vert",
  "Ambre",
  "Violet",
  "Cyan",
  "Rose",
  "Citron",
  "Orange",
] as const;

export const POINT_COLOR_PRESETS: readonly ColorPreset[] = DEFAULT_POINT_COLORS.map(
  (value, index) => ({
    value,
    label: POINT_COLOR_LABELS[index] ?? value,
  }),
);

interface ColorPresetRowProps {
  label: string;
  selectedColor: string;
  disabled: boolean;
  presets?: readonly ColorPreset[];
  onSelect: (color: string) => void;
}

/** Rangée de boutons shadcn/ui permettant de choisir une couleur prédéfinie. */
export function ColorPresetRow({
  label,
  selectedColor,
  disabled,
  presets = BASIC_COLOR_PRESETS,
  onSelect,
}: ColorPresetRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {presets.map((preset) => {
          const active = selectedColor === preset.value;
          return (
            <Tooltip key={preset.value}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant={active ? "secondary" : "ghost"}
                  disabled={disabled}
                  aria-label={`${label} : ${preset.label}`}
                  onClick={() => onSelect(preset.value)}
                  className={active ? "ring-2 ring-ring" : ""}
                >
                  <span
                    className="size-3.5 rounded-full border border-black/20"
                    style={{ backgroundColor: preset.value }}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{preset.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
