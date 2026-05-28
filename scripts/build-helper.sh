#!/usr/bin/env bash
# Компилирует Swift-хелперы (key-helper + ocr-helper) в универсальные
# бинарники (arm64 + x86_64). Запускается автоматически перед npm run build:mac.
set -euo pipefail

NATIVE_DIR="$(dirname "$0")/../src/native"

compile_helper() {
    local name="$1"
    local src="$NATIVE_DIR/${name}.swift"
    local out="$NATIVE_DIR/${name}"

    echo "Компиляция ${name}..."

    # Один target — macOS 11 (Big Sur) для обеих архитектур.
    # macOS 11 — первая версия с поддержкой Apple Silicon, и она же спокойно
    # покрывает требуемые Vision API (VNRecognizeTextRequest, доступен с 10.15).
    if swiftc -O -target arm64-apple-macos11  "$src" -o "/tmp/${name}-arm64" 2>/dev/null && \
       swiftc -O -target x86_64-apple-macos11 "$src" -o "/tmp/${name}-x64"   2>/dev/null; then
        lipo -create -output "$out" "/tmp/${name}-arm64" "/tmp/${name}-x64"
        echo "✓ ${name}: universal binary (arm64 + x86_64)"
    else
        echo "⚠ universal не получился — пересобираю только под $(uname -m). На другой архитектуре работать не будет!"
        swiftc -O "$src" -o "$out"
        echo "✓ ${name}: $(uname -m) (single arch)"
    fi

    chmod +x "$out"
}

compile_helper "key-helper"
compile_helper "ocr-helper"
