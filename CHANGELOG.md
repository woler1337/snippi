# Changelog

## v1.0.3

### 🪟 Windows fixes (critical)
- **Fixed app crash** when PowerShell (used for snippet pasting) failed to spawn — now handled gracefully
- **Fixed OCR not working** on portable builds — language cache now writes to a writable per-user folder
- **Fixed tesseract worker** failing inside the packaged app (asar unpack)
- **Fixed invisible tray icon** on Windows dark taskbar — icon is now recolored to white on Windows/Linux
- **Added NSIS installer** alongside the portable build — enables auto-updates on Windows

### ✨ Features
- **Emoji pack now works via typing** — `:smile:` and other colon-triggers now expand (punctuation keys were previously ignored)
- **Higher translation limit** — add an email in Translate settings to raise MyMemory's daily limit from 5,000 to 50,000 characters
- **License system** — Ed25519-signed offline license keys (Settings → License); foundation for Snippi Pro
- **Rich snippets in palette** — the quick-search palette now respects Markdown/rich format

### 🐛 Bug fixes
- Palette now pastes rich-formatted snippets correctly
- Fixed missing sidebar labels (LIBRARY / TOOLS / Palette) in non-Russian languages
- Fixed "Automatic" theme preview rendering
- `format` field now preserved on snippet duplicate and import

### 🌐 Site & infra
- New website: **snippiapp.com** (redesigned, emerald theme, EN/RU)
- SEO: sitemap, robots.txt, canonical
- Licensing backend (Cloudflare Worker) for future Lemon Squeezy integration

---

## v1.0.2 and earlier
Dynamic placeholders, onboarding, auto-updater, OCR/translate, palette, clipboard
history, emoji pack, Markdown rich snippets, importers (Espanso/Raycast),
i18n (ru/en/de), Privacy/Terms, CI/CD via GitHub Actions.
