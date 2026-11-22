// SPDX-License-Identifier: MPL-2.0
// Évite l'ouverture d'une fenêtre console sous Windows en release. NE PAS SUPPRIMER.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    neomeca2_lib::run()
}
