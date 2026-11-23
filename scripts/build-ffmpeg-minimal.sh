#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Compile un profil FFmpeg + FFprobe minimal sous licence LGPL v2.1+
# (--disable-gpl --disable-nonfree) pour Windows (x86_64) et Linux (x86_64).
#
# Utilisation :
#   bash scripts/build-ffmpeg-minimal.sh [--target linux|windows] [--output-dir <chemin>] [--jobs <n>]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

FFMPEG_VERSION="${FFMPEG_VERSION:-7.1.1}"
FFMPEG_SHA256="733984395e0dbbe5c046abda2dc49a5544e7e0e1e2366bba849222ae9e3a03b1"
FFMPEG_URL="https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz"

TARGET=""
OUTPUT_DIR="$ROOT_DIR/src-tauri/bin"
EXTERNAL_BIN_DIR=""
JOBS=""

usage() {
  cat <<'EOF'
Usage : scripts/build-ffmpeg-minimal.sh [options]

Options :
  --target <linux|windows>      Cible à compiler (auto-détectée par défaut)
  --output-dir <dossier>        Dossier de sortie des binaires (défaut : src-tauri/bin)
  --external-bin-dir <dossier>  Copie aussi les binaires nommés avec target-triple
  --jobs <n>                    Nombre de tâches parallèles make
  -h, --help                    Afficher cette aide
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --external-bin-dir)
      EXTERNAL_BIN_DIR="${2:-}"
      shift 2
      ;;
    --jobs)
      JOBS="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Option inconnue : $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

HOST_OS="$(uname -s)"
if [[ -z "$TARGET" ]]; then
  case "$HOST_OS" in
    MINGW*|MSYS*|CYGWIN*)
      TARGET="windows"
      ;;
    Linux)
      TARGET="linux"
      ;;
    *)
      echo "Système hôte non pris en charge par défaut : $HOST_OS (utilisez --target)" >&2
      exit 1
      ;;
  esac
fi

if [[ "$TARGET" != "linux" && "$TARGET" != "windows" ]]; then
  echo "Cible invalide : $TARGET (attendu : linux ou windows)" >&2
  exit 1
fi

if [[ -z "$JOBS" ]]; then
  if command -v nproc >/dev/null 2>&1; then
    JOBS="$(nproc)"
  else
    JOBS="4"
  fi
fi

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"

if [[ -n "$EXTERNAL_BIN_DIR" ]]; then
  mkdir -p "$EXTERNAL_BIN_DIR"
  EXTERNAL_BIN_DIR="$(cd "$EXTERNAL_BIN_DIR" && pwd)"
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/neomeca-ffmpeg-XXXXXX")"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

TARBALL="$WORK_DIR/ffmpeg-${FFMPEG_VERSION}.tar.xz"
SRC_DIR="$WORK_DIR/ffmpeg-${FFMPEG_VERSION}"
INSTALL_DIR="$WORK_DIR/install"

echo "Téléchargement de FFmpeg ${FFMPEG_VERSION}..."
curl -fsSL "$FFMPEG_URL" -o "$TARBALL"

echo "Vérification de l'empreinte SHA-256..."
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA256="$(sha256sum "$TARBALL" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA256="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
else
  echo "Aucun outil sha256sum / shasum disponible pour vérifier l'archive." >&2
  exit 1
fi

if [[ "$FFMPEG_VERSION" == "7.1.1" && "$ACTUAL_SHA256" != "$FFMPEG_SHA256" ]]; then
  echo "Empreinte SHA-256 invalide pour ffmpeg-${FFMPEG_VERSION}.tar.xz" >&2
  echo "  Attendu : $FFMPEG_SHA256" >&2
  echo "  Obtenu  : $ACTUAL_SHA256" >&2
  exit 1
fi

echo "Extraction de l'archive FFmpeg..."
tar -xf "$TARBALL" -C "$WORK_DIR"

CONFIGURE_FLAGS=(
  --prefix="$INSTALL_DIR"
  --enable-static
  --disable-shared
  --disable-everything
  --disable-gpl
  --disable-nonfree
  --disable-doc
  --disable-htmlpages
  --disable-manpages
  --disable-podpages
  --disable-txtpages
  --disable-network
  --disable-autodetect
  --disable-avdevice
  --disable-postproc
  --enable-small
  --enable-ffmpeg
  --enable-ffprobe
  --enable-protocol=file
  --enable-demuxer=mov,avi,matroska,image2
  --enable-muxer=image2,mjpeg
  --enable-decoder=h264,hevc,mpeg4,mjpeg,vp8,vp9,av1,indeo3,indeo4,indeo5,cinepak,msvideo1,rawvideo,mpeg1video,mpeg2video,flv,wmv1,wmv2,wmv3,vc1,theora
  --enable-parser=h264,hevc,mpeg4video,mjpeg,vp8,vp9,av1,mpegvideo
  --enable-encoder=mjpeg
  --enable-filter=buffer,buffersink,scale,format,transpose,vflip,hflip,null,anull
)

if ! command -v nasm >/dev/null 2>&1 && ! command -v yasm >/dev/null 2>&1; then
  echo "Avertissement : nasm/yasm introuvable, désactivation de x86asm."
  CONFIGURE_FLAGS+=(--disable-x86asm)
fi

STRIP_BIN="strip"
BIN_EXT=""
TARGET_TRIPLE="x86_64-unknown-linux-gnu"

if [[ "$TARGET" == "windows" ]]; then
  BIN_EXT=".exe"
  TARGET_TRIPLE="x86_64-pc-windows-msvc"
  # Utiliser les threads natifs Win32 et le linkage statique complet pour éviter toute DLL MinGW.
  CONFIGURE_FLAGS+=(
    --arch=x86_64
    --target-os=mingw32
    --disable-pthreads
    --enable-w32threads
    --extra-ldflags="-static -static-libgcc"
  )
  case "$HOST_OS" in
    MINGW*|MSYS*|CYGWIN*)
      ;;
    *)
      CONFIGURE_FLAGS+=(--cross-prefix=x86_64-w64-mingw32-)
      STRIP_BIN="x86_64-w64-mingw32-strip"
      ;;
  esac
fi

echo "Configuration de FFmpeg pour la cible $TARGET..."
pushd "$SRC_DIR" >/dev/null
./configure "${CONFIGURE_FLAGS[@]}"

echo "Compilation de FFmpeg (${JOBS} tâches)..."
make -j"$JOBS"
make install
popd >/dev/null

FFMPEG_OUT="$OUTPUT_DIR/ffmpeg${BIN_EXT}"
FFPROBE_OUT="$OUTPUT_DIR/ffprobe${BIN_EXT}"

cp "$INSTALL_DIR/bin/ffmpeg${BIN_EXT}" "$FFMPEG_OUT"
cp "$INSTALL_DIR/bin/ffprobe${BIN_EXT}" "$FFPROBE_OUT"

if command -v "$STRIP_BIN" >/dev/null 2>&1; then
  "$STRIP_BIN" "$FFMPEG_OUT" "$FFPROBE_OUT"
fi

if [[ "$TARGET" == "linux" ]]; then
  chmod 0755 "$FFMPEG_OUT" "$FFPROBE_OUT"
fi

if [[ -n "$EXTERNAL_BIN_DIR" ]]; then
  cp "$FFMPEG_OUT" "$EXTERNAL_BIN_DIR/ffmpeg-${TARGET_TRIPLE}${BIN_EXT}"
  cp "$FFPROBE_OUT" "$EXTERNAL_BIN_DIR/ffprobe-${TARGET_TRIPLE}${BIN_EXT}"
  if [[ "$TARGET" == "linux" ]]; then
    chmod 0755 \
      "$EXTERNAL_BIN_DIR/ffmpeg-${TARGET_TRIPLE}${BIN_EXT}" \
      "$EXTERNAL_BIN_DIR/ffprobe-${TARGET_TRIPLE}${BIN_EXT}"
  fi
fi

# Vérifier l'exécution et la licence LGPL lorsque la cible correspond à l'hôte.
CAN_RUN_NATIVE="false"
if [[ "$TARGET" == "linux" && "$HOST_OS" == "Linux" ]]; then
  CAN_RUN_NATIVE="true"
elif [[ "$TARGET" == "windows" && "$HOST_OS" =~ ^(MINGW|MSYS|CYGWIN) ]]; then
  CAN_RUN_NATIVE="true"
fi

if [[ "$CAN_RUN_NATIVE" == "true" ]]; then
  VERSION_OUT="$("$FFMPEG_OUT" -version)"
  if ! grep -q -- "--disable-gpl" <<<"$VERSION_OUT" || ! grep -q -- "--disable-nonfree" <<<"$VERSION_OUT"; then
    echo "Erreur : le binaire FFmpeg produit ne respecte pas --disable-gpl --disable-nonfree." >&2
    exit 1
  fi
  "$FFPROBE_OUT" -version >/dev/null
  echo "Licence vérifiée : profil LGPL conforme (--disable-gpl --disable-nonfree)."
fi

FFMPEG_BYTES="$(wc -c < "$FFMPEG_OUT")"
FFPROBE_BYTES="$(wc -c < "$FFPROBE_OUT")"
TOTAL_BYTES=$((FFMPEG_BYTES + FFPROBE_BYTES))

echo "Binaires générés :"
echo "  $FFMPEG_OUT ($FFMPEG_BYTES octets)"
echo "  $FFPROBE_OUT ($FFPROBE_BYTES octets)"
echo "  Taille combinée : $TOTAL_BYTES octets"
