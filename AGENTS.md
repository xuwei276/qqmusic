# AGENTS.md

This repository is a local QQ Music karaoke-style player demo. It combines a Node/Express proxy with a static browser UI for search, playback, synced lyrics, pinyin, weather, and a music visualizer.

## Project Overview

- Runtime: Node.js ESM, Express static server.
- Main service: `server.js`
- Frontend files: `public/index.html`, `public/style.css`, `public/app.js`
- Default URL: `http://localhost:5174`
- Preferred URL for QQ Music login/cookie behavior: `https://local.y.qq.com:5174`
- Git remote: `https://github.com/xuwei276/qqmusic.git`

## Commands

```powershell
npm install
npm start
```

For local QQ domain HTTPS:

```powershell
.\scripts\setup-local-qq-host.ps1
npm start
```

If port 5174 is occupied:

```powershell
$env:PORT='5175'; npm start
```

Basic checks:

```powershell
node --check server.js
node --check public\app.js
curl.exe --noproxy local.y.qq.com -k -I https://local.y.qq.com:5174/
```

Restart server:

```powershell
$procs = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like '*server.js*' }
foreach ($proc in $procs) { Stop-Process -Id $proc.ProcessId -Force }
$env:PORT='5174'
Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList 'start' -WorkingDirectory 'D:\work\test\test5'
```

## Important Files And Assets

- `server.js`: all backend routes and QQ/Open-Meteo proxy logic.
- `public/app.js`: search, playback, lyrics sync, pinyin rendering, Web Audio visualizer, weather loading.
- `public/style.css`: full-screen karaoke UI, wallpaper, lyric typography, drawer, progress bar.
- `public/assets/karaoke-wallpaper.png`: current background image.
- `public/assets/fonts/Yozai-Medium.ttf`: lyric handwriting font.
- `public/assets/fonts/Yozai-OFL.txt`: font license, keep this if redistributing the font.
- `certs/`: local dev HTTPS certs, ignored by git.
- `tmp/`: generation intermediates, ignored by git.
- `node_modules/`: ignored by git.

## Main Features

### Search

Local route:

```text
GET /api/search?q=周杰伦&page=1&limit=18
```

Upstream QQ endpoint:

```text
https://c.y.qq.com/soso/fcgi-bin/client_search_cp
```

The route returns normalized song fields including `songmid`, `mediaMid`, song title, album, singers, duration, and QQ song detail URL.

### Playback URL

Frontend first tries browser-side JSONP to:

```text
https://u.y.qq.com/cgi-bin/musicu.fcg
```

Module/method:

```json
{
  "module": "vkey.GetVkeyServer",
  "method": "CgiGetVkey"
}
```

If browser-side lookup fails or returns no `purl`, frontend falls back to:

```text
GET /api/play-url?songmid=...&mediaMid=...
```

Songs requiring login/member rights may still return no playable `purl`. The user has been using the official QQ Music login page flow rather than the server QR flow.

### Audio Proxy And Real Visualizer

For real frequency data, the frontend uses:

```text
GET /api/audio-proxy?url=<encoded QQ audio URL>
```

The proxy forwards QQ audio streams and supports `Range` so seeking still works. It only allows QQ/CDN style hosts such as `qqmusic.qq.com`, `music.tc.qq.com`, `*.qq.com`, and `*.myqcloud.com`.

Frontend flow:

1. Get QQ `playUrl`.
2. Set audio source to `/api/audio-proxy?url=...`.
3. Wait for playable metadata/canplay.
4. If proxy works, initialize `AudioContext`, `createMediaElementSource`, and `AnalyserNode`.
5. If proxy fails, fall back to direct QQ audio URL and use simulated visualizer.

Do not connect cross-origin QQ audio directly to Web Audio; it can cause silence or blocked frequency data.

### Lyrics And Pinyin

Local route:

```text
GET /api/lyrics?songmid=...
```

Upstream:

```text
https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg
```

The server parses LRC and uses `pinyin-pro` to return:

- `text`
- `pinyin`
- `tokens`: per-character `{ text, pinyin }`

The frontend renders current lyric and pinyin using matching token cells, so pinyin aligns above each Chinese character.

### Weather

Local route:

```text
GET /api/weather?city=Shanghai
```

Uses Open-Meteo:

- Geocoding: `https://geocoding-api.open-meteo.com/v1/search`
- Forecast: `https://api.open-meteo.com/v1/forecast`

Open-Meteo is free and does not need an API key for this usage. The UI currently defaults to Shanghai and updates the top-left weather card.

## UI Notes

- The app is intentionally not a landing page. It opens directly as a full-screen karaoke player.
- Current visual direction: cool blue cinematic portrait background, subtle transparent overlays, lyrics as the main foreground.
- Search/results live in the right drawer.
- Official QQ login buttons also live in the right drawer.
- Native `<audio>` is hidden.
- Bottom progress line is subtle but clickable/draggable and supports keyboard seeking.
- The old server-side QR login UI was removed because QQ returned HTTP 403 for `ptqrlogin` from the local server path.

## Known Gotchas

- Local HTTPS/domain setup matters for QQ cookie behavior. Use `https://local.y.qq.com:5174`.
- Editing `hosts` requires administrator permissions.
- `certs/` are local-only and must not be committed.
- Image generation can fail with Cloudflare `HTTP 524`; if retry fails, do not keep retrying indefinitely.
- The Yozai font file is about 15 MB. It is intentionally committed because the UI depends on it.
- Old generated image response folders under `public/assets/generated-*` are ignored and not required.
- The real visualizer depends on the audio proxy successfully returning a playable audio stream. If it fails, playback should still work through direct QQ audio, but the visualizer falls back to simulated mode.

## Git Hygiene

Ignored:

- `node_modules/`
- `certs/`
- `tmp/`
- `.env*`
- `public/assets/generated-*/`
- `public/assets/music-wallpaper.png`

Before committing:

```powershell
git status --short
node --check server.js
node --check public\app.js
```

Push:

```powershell
git push
```

