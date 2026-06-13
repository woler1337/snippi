# Как выпустить новую версию

Автоматизировано через GitHub Actions ([release.yml](workflows/release.yml)).

## TL;DR

```bash
# 1. Подними версию в package.json (например с 1.0.1 на 1.0.2)
# 2. Коммит + тег + push
git add package.json
git commit -m "Release v1.0.2"
git tag v1.0.2
git push origin main --tags
```

Всё. Через ~15-20 минут на https://github.com/woler1337/snippi/releases появится новый
релиз с DMG (arm64+x64), portable EXE и фидом `latest-mac.yml` / `latest.yml`.

## Что происходит под капотом

1. `git push --tags` пушит тег `v1.0.2` в GitHub
2. Workflow `Release` срабатывает на любой `v*` тег
3. Две параллельных джобы:
   - **macos-latest** — компилирует Swift-хелперы → собирает DMG arm64+x64 → публикует
   - **windows-latest** — собирает portable .exe → публикует
4. electron-builder автоматически создаёт Release на GitHub с этим тегом и заливает
   туда все артефакты + `latest-*.yml` фиды для electron-updater'а
5. У пользователей при следующем запуске приложение само скачает обновление

## Если что-то упало

- Зайди в **Actions** → найди запавший Run → посмотри логи конкретной OS
- В каждом Run есть **Artifacts** — DMG/EXE можно скачать руками
  (хранятся 7 дней)
- Если упал только Windows (например) — можно перезапустить только эту джобу
  через **«Re-run failed jobs»**, не пересобирая mac

## Когда нужен ручной запуск

В workflow добавлен `workflow_dispatch` — можно запустить сборку из вкладки
**Actions → Release → Run workflow** без пуша тега. Полезно когда нужно
переделать сборку без увеличения версии.

## Требования к окружению

Ничего не нужно — `secrets.GITHUB_TOKEN` подставляется автоматически.
Никаких личных токенов в репо хранить не надо.
