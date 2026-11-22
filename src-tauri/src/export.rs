// SPDX-License-Identifier: MPL-2.0
//! Export natif de tableaux de mesures au format Excel (.xlsx).

use rust_xlsxwriter::{Format, Workbook, Worksheet};
use serde::Deserialize;
use std::collections::HashSet;
use std::path::Path;

const MAX_SHEET_NAME_CHARS: usize = 31;
const FORBIDDEN_SHEET_CHARS: [char; 7] = ['[', ']', ':', '*', '?', '/', '\\'];

/// Ligne de mesures cinématiques et énergétiques envoyée par le frontend.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelRowData {
    pub frame_number: u32,
    pub time_secs: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub vx: Option<f64>,
    pub vy: Option<f64>,
    pub speed: Option<f64>,
    pub ax: Option<f64>,
    pub ay: Option<f64>,
    pub acceleration: Option<f64>,
    pub kinetic_energy: Option<f64>,
    pub potential_energy: Option<f64>,
    pub mechanical_energy: Option<f64>,
}

/// Feuille Excel correspondant à un point suivi.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelSheetData {
    pub point_name: String,
    pub include_energies: bool,
    pub rows: Vec<ExcelRowData>,
}

/// Nettoie et déduplique un nom d'onglet pour respecter les contraintes d'Excel
/// (31 caractères maximum, sans `[]:*?/\\`, sans apostrophe en bordure).
pub(crate) fn sanitize_sheet_name(raw: &str, used_lower: &mut HashSet<String>) -> String {
    let cleaned: String = raw
        .chars()
        .map(|ch| {
            if FORBIDDEN_SHEET_CHARS.contains(&ch) || ch.is_control() {
                '_'
            } else {
                ch
            }
        })
        .collect();

    let trimmed = cleaned.trim().trim_matches('\'').trim();
    let base_str = if trimmed.is_empty() { "Point" } else { trimmed };

    let truncated_raw: String = base_str.chars().take(MAX_SHEET_NAME_CHARS).collect();
    let truncated_clean = truncated_raw.trim_end_matches('\'').trim();
    let truncated = if truncated_clean.is_empty() {
        "Point".to_string()
    } else {
        truncated_clean.to_string()
    };
    if used_lower.insert(truncated.to_lowercase()) {
        return truncated;
    }

    let mut suffix_index = 2usize;
    loop {
        let suffix = format!(" ({suffix_index})");
        let max_prefix = MAX_SHEET_NAME_CHARS.saturating_sub(suffix.chars().count());
        let prefix: String = base_str
            .chars()
            .take(max_prefix)
            .collect::<String>()
            .trim_end_matches('\'')
            .trim()
            .to_string();
        let candidate = format!("{}{suffix}", if prefix.is_empty() { "Point" } else { &prefix });
        if used_lower.insert(candidate.to_lowercase()) {
            return candidate;
        }
        suffix_index += 1;
    }
}

fn write_opt_number(
    worksheet: &mut Worksheet,
    row: u32,
    col: u16,
    value: Option<f64>,
) -> Result<(), String> {
    if let Some(val) = value
        && val.is_finite()
    {
        worksheet
            .write_number(row, col, val)
            .map_err(|error| format!("Erreur d'écriture Excel : {error}"))?;
    }
    Ok(())
}

fn build_workbook(sheets: &[ExcelSheetData]) -> Result<Workbook, String> {
    if sheets.is_empty() {
        return Err("Aucune feuille à exporter dans le classeur Excel.".to_string());
    }

    let mut workbook = Workbook::new();
    let header_format = Format::new().set_bold();
    let mut used_names = HashSet::new();

    for sheet_data in sheets {
        let sheet_name = sanitize_sheet_name(&sheet_data.point_name, &mut used_names);
        let worksheet = workbook.add_worksheet();
        worksheet
            .set_name(&sheet_name)
            .map_err(|error| format!("Nom d'onglet Excel invalide ({sheet_name}) : {error}"))?;

        let mut headers = vec![
            "Image",
            "t (s)",
            "x (m)",
            "y (m)",
            "vx (m/s)",
            "vy (m/s)",
            "v (m/s)",
            "ax (m/s²)",
            "ay (m/s²)",
            "a (m/s²)",
        ];
        if sheet_data.include_energies {
            headers.extend(["Ec (J)", "Ep (J)", "Em (J)"]);
        }

        for (col_idx, title) in headers.iter().enumerate() {
            worksheet
                .write_string_with_format(0, col_idx as u16, *title, &header_format)
                .map_err(|error| format!("Erreur d'en-tête Excel : {error}"))?;
        }

        for (index, row) in sheet_data.rows.iter().enumerate() {
            let excel_row = u32::try_from(index + 1)
                .map_err(|_| "Nombre de lignes supérieur à la limite Excel.".to_string())?;

            worksheet
                .write_number(excel_row, 0, f64::from(row.frame_number))
                .map_err(|error| format!("Erreur d'écriture Excel : {error}"))?;
            write_opt_number(worksheet, excel_row, 1, Some(row.time_secs))?;
            write_opt_number(worksheet, excel_row, 2, row.x)?;
            write_opt_number(worksheet, excel_row, 3, row.y)?;
            write_opt_number(worksheet, excel_row, 4, row.vx)?;
            write_opt_number(worksheet, excel_row, 5, row.vy)?;
            write_opt_number(worksheet, excel_row, 6, row.speed)?;
            write_opt_number(worksheet, excel_row, 7, row.ax)?;
            write_opt_number(worksheet, excel_row, 8, row.ay)?;
            write_opt_number(worksheet, excel_row, 9, row.acceleration)?;

            if sheet_data.include_energies {
                write_opt_number(worksheet, excel_row, 10, row.kinetic_energy)?;
                write_opt_number(worksheet, excel_row, 11, row.potential_energy)?;
                write_opt_number(worksheet, excel_row, 12, row.mechanical_energy)?;
            }
        }

        worksheet.set_freeze_panes(1, 0)
            .map_err(|error| format!("Erreur de figement des volets Excel : {error}"))?;
        worksheet.autofit();
    }

    Ok(workbook)
}

fn write_excel_sync(path: &Path, sheets: &[ExcelSheetData]) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("Chemin d'export Excel vide.".to_string());
    }
    let mut workbook = build_workbook(sheets)?;
    workbook
        .save(path)
        .map_err(|error| format!("Impossible d'enregistrer le fichier Excel : {error}"))
}

/// Commande Tauri : exporte une ou plusieurs séries de mesures en fichier `.xlsx`.
#[tauri::command]
pub async fn export_excel_xlsx(
    path: String,
    sheets: Vec<ExcelSheetData>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_excel_sync(Path::new(&path), &sheets))
        .await
        .map_err(|error| format!("Échec de l'export Excel : {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row(frame_number: u32, time_secs: f64) -> ExcelRowData {
        ExcelRowData {
            frame_number,
            time_secs,
            x: Some(0.5),
            y: Some(1.25),
            vx: None,
            vy: None,
            speed: None,
            ax: None,
            ay: None,
            acceleration: None,
            kinetic_energy: None,
            potential_energy: Some(6.13125),
            mechanical_energy: None,
        }
    }

    #[test]
    fn sanitize_sheet_name_enforces_excel_rules_and_uniqueness() {
        let mut used = HashSet::new();

        assert_eq!(sanitize_sheet_name("Bille [1]:a*b?/\\", &mut used), "Bille _1__a_b___");
        assert_eq!(sanitize_sheet_name("  '   ", &mut used), "Point");

        let long = "Point_de_mesure_tres_long_qui_'depasse_trente_et_un_caracteres";
        let truncated = sanitize_sheet_name(long, &mut used);
        assert!(truncated.chars().count() <= 31);
        assert!(!truncated.ends_with('\''));

        // Collision insensible à la casse
        assert_eq!(sanitize_sheet_name("P1", &mut used), "P1");
        assert_eq!(sanitize_sheet_name("p1", &mut used), "p1 (2)");
        assert_eq!(sanitize_sheet_name("P1", &mut used), "P1 (3)");
    }

    #[test]
    fn build_workbook_produces_valid_xlsx_zip_buffer() {
        let sheets = vec![
            ExcelSheetData {
                point_name: "P1".to_string(),
                include_energies: true,
                rows: vec![sample_row(1, 0.0), sample_row(2, 0.04)],
            },
            ExcelSheetData {
                point_name: "P2".to_string(),
                include_energies: false,
                rows: vec![sample_row(1, 0.0)],
            },
        ];

        let mut workbook = build_workbook(&sheets).unwrap();
        let buffer = workbook.save_to_buffer().unwrap();
        assert!(buffer.len() > 500);
        // Signature ZIP d'un classeur .xlsx
        assert_eq!(&buffer[..4], b"PK\x03\x04");
    }

    #[test]
    fn build_workbook_rejects_empty_sheets() {
        let result = build_workbook(&[]);
        assert!(result.is_err());
    }

    #[test]
    fn write_excel_sync_creates_file_on_disk() {
        let temp_path = std::env::temp_dir().join(format!(
            "neomeca_export_test_{}.xlsx",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&temp_path);

        let sheets = vec![ExcelSheetData {
            point_name: "Mobile".to_string(),
            include_energies: false,
            rows: vec![sample_row(1, 0.0)],
        }];
        write_excel_sync(&temp_path, &sheets).unwrap();

        let bytes = std::fs::read(&temp_path).unwrap();
        assert_eq!(&bytes[..4], b"PK\x03\x04");
        let _ = std::fs::remove_file(&temp_path);
    }
}
