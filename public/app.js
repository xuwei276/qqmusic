const playbackHistoryKey = "qqMusicPlaybackHistory";
const maxPlaybackHistory = 80;

const state = {
  sessionId: "",
  drawerOpen: false,
  activePanel: "search",
  playbackHistory: readPlaybackHistory(),
  currentHistoryIndex: -1,
  currentSong: null
};

const loginState = document.querySelector("#loginState");
const loginLog = document.querySelector("#loginLog");
const weatherIcon = document.querySelector("#weatherIcon");
const weatherCity = document.querySelector("#weatherCity");
const weatherText = document.querySelector("#weatherText");
const officialLogin = document.querySelector("#officialLogin");
const searchForm = document.querySelector("#searchForm");
const toggleSearch = document.querySelector("#toggleSearch");
const keyword = document.querySelector("#keyword");
const searchState = document.querySelector("#searchState");
const results = document.querySelector("#results");
const resultsDrawer = document.querySelector("#resultsDrawer");
const closeResults = document.querySelector("#closeResults");
const drawerKicker = document.querySelector("#drawerKicker");
const drawerTitle = document.querySelector("#drawerTitle");
const searchPanel = document.querySelector("#searchPanel");
const historyPanel = document.querySelector("#historyPanel");
const player = document.querySelector("#player");
const playState = document.querySelector("#playState");
const heroState = document.querySelector("#heroState");
const currentTrack = document.querySelector("#currentTrack");
const pinyinLyric = document.querySelector("#pinyinLyric");
const currentLyric = document.querySelector("#currentLyric");
const nextLyric = document.querySelector("#nextLyric");
const lyricsList = document.querySelector("#lyricsList");
const visualizerMode = document.querySelector("#visualizerMode");
const toggleVisualizer = document.querySelector("#toggleVisualizer");
const trackProgress = document.querySelector("#trackProgress");
const trackProgressFill = document.querySelector("#trackProgressFill");
const trackTime = document.querySelector("#trackTime");
const visualizer = document.querySelector("#visualizer");
const visualizerContext = visualizer.getContext("2d");
const vinylRecord = document.querySelector(".vinyl-record");
const togglePlayback = document.querySelector("#togglePlayback");
const transportHint = document.querySelector("#transportHint");
const toggleHistory = document.querySelector("#toggleHistory");
const historyList = document.querySelector("#historyList");
const playHistory = document.querySelector("#playHistory");
const clearHistory = document.querySelector("#clearHistory");

const officialLoginUrl = "https://y.qq.com/n/ryqq_v2/profile";
const visualizerState = {
  frame: 0,
  running: false,
  lastWidth: 0,
  lastHeight: 0,
  usingRealAudio: false,
  peakCaps: [],
  mode: readVisualizerMode()
};
const audioAnalysisState = {
  context: null,
  analyser: null,
  source: null,
  frequencyData: null,
  enabled: false,
  preparingProxy: false
};
const lyricState = {
  lines: [],
  activeIndex: -1
};
const seekState = {
  dragging: false
};

function readVisualizerMode() {
  try {
    const mode = localStorage.getItem("qqMusicVisualizerMode");
    return ["classic", "liquidGlass", "radialWave"].includes(mode) ? mode : "liquidGlass";
  } catch {
    return "liquidGlass";
  }
}

function setVisualizerMode(mode) {
  visualizerState.mode = ["classic", "liquidGlass", "radialWave"].includes(mode) ? mode : "liquidGlass";
  try {
    localStorage.setItem("qqMusicVisualizerMode", visualizerState.mode);
  } catch {
    // Ignore storage failures in private or restricted browsing contexts.
  }
  updateVisualizerModeLabel(false);
}

function updateVisualizerModeLabel(hasRealFrequency) {
  const modeLabel = {
    classic: "经典频谱",
    liquidGlass: "液态玻璃",
    radialWave: "环形声波"
  }[visualizerState.mode] || "液态玻璃";
  const sourceLabel = hasRealFrequency ? "真实频谱" : (player.paused ? "低频待机" : "模拟频谱");
  visualizerMode.textContent = `${modeLabel} · ${sourceLabel}`;
  if (toggleVisualizer) {
    toggleVisualizer.textContent = modeLabel;
    toggleVisualizer.setAttribute("aria-label", `切换可视化模式，当前为${modeLabel}`);
  }
}

function setLog(data) {
  loginLog.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

async function loadWeather(city = "Shanghai") {
  try {
    const payload = await readJson(await fetch(`/api/weather?city=${encodeURIComponent(city)}`));
    const displayCity = payload.admin1 && payload.admin1 !== payload.city
      ? `${payload.city}`
      : payload.city;
    const time = payload.time
      ? new Date(payload.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
      : "--:--";

    weatherIcon.textContent = payload.icon || "☁";
    weatherCity.textContent = displayCity || city;
    weatherText.textContent = `${time}, ${Math.round(payload.temperature)}${payload.temperatureUnit || "°C"}, ${payload.description}`;
  } catch (error) {
    weatherIcon.textContent = "☁";
    weatherCity.textContent = city;
    weatherText.textContent = "Weather unavailable";
    setLog(`天气加载失败：${error.message}`);
  }
}

function setActivePanel(panel) {
  const nextPanel = panel === "history" ? "history" : "search";
  state.activePanel = nextPanel;
  searchPanel?.classList.toggle("is-active", nextPanel === "search");
  historyPanel?.classList.toggle("is-active", nextPanel === "history");
  toggleSearch?.classList.toggle("is-active", nextPanel === "search");
  toggleHistory?.classList.toggle("is-active", nextPanel === "history");

  if (drawerKicker) drawerKicker.textContent = nextPanel === "history" ? "Played" : "Search";
  if (drawerTitle) drawerTitle.textContent = nextPanel === "history" ? "播放历史" : "搜索歌曲";
}

function setDrawer(open, panel = state.activePanel) {
  if (open) setActivePanel(panel);
  state.drawerOpen = open;
  resultsDrawer.classList.toggle("is-open", open);
  toggleSearch?.setAttribute("aria-expanded", String(open && state.activePanel === "search"));
  toggleHistory?.setAttribute("aria-expanded", String(open && state.activePanel === "history"));

  if (open && state.activePanel === "search") {
    window.requestAnimationFrame(() => keyword.focus());
  }
}

function toggleDrawerPanel(panel) {
  const shouldClose = state.drawerOpen && state.activePanel === panel;
  setDrawer(!shouldClose, panel);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minute = Math.floor(seconds / 60);
  const second = String(seconds % 60).padStart(2, "0");
  return `${minute}:${second}`;
}

function readPlaybackHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(playbackHistoryKey) || "[]");
    return Array.isArray(parsed)
      ? parsed.map(normalizeSong).filter((song) => song.songmid && song.mediaMid)
      : [];
  } catch {
    return [];
  }
}

function savePlaybackHistory() {
  try {
    localStorage.setItem(playbackHistoryKey, JSON.stringify(state.playbackHistory));
  } catch {
    // History is a convenience feature; playback should not fail if storage is unavailable.
  }
}

function normalizeSong(song) {
  return {
    songmid: String(song?.songmid || "").trim(),
    mediaMid: String(song?.mediaMid || "").trim(),
    title: String(song?.title || song?.songname || "未知歌曲").trim(),
    singers: Array.isArray(song?.singers)
      ? song.singers.map((singer) => String(singer).trim()).filter(Boolean)
      : String(song?.singers || "").split(/[\/,，]/).map((singer) => singer.trim()).filter(Boolean),
    albumname: String(song?.albumname || "").trim(),
    interval: Number(song?.interval) || 0,
    coverUrl: String(song?.coverUrl || "").trim(),
    url: String(song?.url || "").trim()
  };
}

function songKey(song) {
  return `${song.songmid}::${song.mediaMid}`;
}

function songFromButton(button) {
  return normalizeSong({
    songmid: button.dataset.songmid,
    mediaMid: button.dataset.mediaMid,
    title: button.dataset.title,
    singers: button.dataset.singers,
    albumname: button.dataset.albumname,
    interval: button.dataset.interval,
    coverUrl: button.dataset.coverUrl,
    url: button.dataset.url
  });
}

function rememberPlayedSong(song) {
  const normalized = normalizeSong(song);
  if (!normalized.songmid || !normalized.mediaMid) return;

  const key = songKey(normalized);
  const existingIndex = state.playbackHistory.findIndex((item) => songKey(item) === key);
  if (existingIndex >= 0) {
    state.playbackHistory[existingIndex] = { ...state.playbackHistory[existingIndex], ...normalized };
    state.currentHistoryIndex = existingIndex;
  } else {
    state.playbackHistory.push(normalized);
    if (state.playbackHistory.length > maxPlaybackHistory) {
      state.playbackHistory = state.playbackHistory.slice(-maxPlaybackHistory);
    }
    state.currentHistoryIndex = state.playbackHistory.findIndex((item) => songKey(item) === key);
  }

  savePlaybackHistory();
  renderPlaybackHistory();
}

function renderPlaybackHistory() {
  if (!historyList) return;

  const hasHistory = state.playbackHistory.length > 0;
  playHistory.disabled = !hasHistory;
  clearHistory.disabled = !hasHistory;

  if (!hasHistory) {
    historyList.innerHTML = `<p class="history-empty">播放过的歌曲会出现在这里</p>`;
    return;
  }

  historyList.innerHTML = state.playbackHistory.map((song, index) => {
    const isCurrent = index === state.currentHistoryIndex;
    const singerText = song.singers.length ? song.singers.join(" / ") : "未知歌手";
    return `
      <article class="history-song${isCurrent ? " is-current" : ""}">
        <button class="history-play" type="button" data-history-index="${index}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <strong>${escapeHtml(song.title)}</strong>
          <small>${escapeHtml(singerText)}</small>
        </button>
        <time>${formatDuration(song.interval)}</time>
      </article>
    `;
  }).join("");
}

async function playHistoryAt(index) {
  const song = state.playbackHistory[index];
  if (!song) return false;
  state.currentHistoryIndex = index;
  renderPlaybackHistory();
  await playSong(song);
  return true;
}

async function playNextHistorySong() {
  if (!state.playbackHistory.length || state.currentHistoryIndex < 0) {
    heroState.textContent = "播放结束";
    return;
  }

  const nextIndex = state.currentHistoryIndex + 1;
  if (nextIndex >= state.playbackHistory.length) {
    heroState.textContent = "列表播放完毕";
    playState.textContent = "播放历史已按顺序播完";
    updateTransportControl();
    return;
  }

  playState.textContent = "正在按历史顺序播放下一首";
  try {
    await playHistoryAt(nextIndex);
  } catch (error) {
    playState.textContent = `下一首播放失败：${error.message}`;
    heroState.textContent = "播放失败";
  }
}

function updateTrackProgress() {
  const current = player.currentTime || 0;
  const duration = player.duration || 0;
  const percent = duration ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
  trackProgressFill.style.width = `${percent}%`;
  trackProgress.style.setProperty("--track-progress", `${percent}%`);
  trackProgress.setAttribute("aria-valuenow", String(Math.round(percent)));
  trackProgress.setAttribute("aria-valuetext", `${formatDuration(Math.floor(current))} / ${formatDuration(Math.floor(duration))}`);
  trackTime.textContent = `${formatDuration(Math.floor(current))} / ${formatDuration(Math.floor(duration))}`;
  updateTransportControl();
}

function updateTransportControl() {
  if (!togglePlayback) return;
  const canToggle = Boolean(player.currentSrc || player.src);
  const playing = canToggle && !player.paused && !player.ended;
  togglePlayback.disabled = !canToggle;
  togglePlayback.classList.toggle("is-playing", playing);
  togglePlayback.setAttribute("aria-label", playing ? "暂停" : "播放");
  const transportIcon = togglePlayback.querySelector(".transport-icon");
  if (transportIcon) {
    transportIcon.src = playing
      ? transportIcon.dataset.pauseSrc
      : transportIcon.dataset.playSrc;
  }
  if (transportHint) {
    transportHint.textContent = canToggle ? (playing ? "暂停" : "播放") : "选择歌曲后播放";
  }
}

function seekByPointer(event) {
  const duration = player.duration || 0;
  if (!duration) return;
  const rect = trackProgress.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  player.currentTime = ratio * duration;
  updateTrackProgress();
  updateLyrics();
}

function seekByOffset(seconds) {
  const duration = player.duration || 0;
  if (!duration) return;
  player.currentTime = Math.min(duration, Math.max(0, (player.currentTime || 0) + seconds));
  updateTrackProgress();
  updateLyrics();
}

async function search(event) {
  event?.preventDefault();
  setDrawer(true, "search");

  const q = keyword.value.trim();
  if (!q) return;

  searchState.textContent = "搜索中";
  results.innerHTML = "";
  setDrawer(true);

  const params = new URLSearchParams({ q, page: "1", limit: "18" });
  if (state.sessionId) params.set("sessionId", state.sessionId);

  try {
    const payload = await readJson(await fetch(`/api/search?${params}`));
    searchState.textContent = `${payload.total} 条结果`;
    results.innerHTML = payload.songs.map((song) => `
      <article class="song">
        <div>
          <a href="${song.url}" target="_blank" rel="noreferrer">${escapeHtml(song.songname)}</a>
          <p>${escapeHtml(song.singers.join(" / "))}</p>
        </div>
        <span>${escapeHtml(song.albumname || "未知专辑")}</span>
        <time>${formatDuration(song.interval)}</time>
        <button
          class="play-btn"
          type="button"
          data-songmid="${escapeHtml(song.songmid)}"
          data-media-mid="${escapeHtml(song.mediaMid || "")}"
          data-title="${escapeHtml(song.songname)}"
          data-singers="${escapeHtml(song.singers.join(" / "))}"
          data-albumname="${escapeHtml(song.albumname || "")}"
          data-interval="${escapeHtml(song.interval || 0)}"
          data-cover-url="${escapeHtml(song.coverUrl || "")}"
          data-url="${escapeHtml(song.url || "")}"
        >播放</button>
      </article>
    `).join("");
  } catch (error) {
    searchState.textContent = "搜索失败";
    results.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
}

async function playSong(source) {
  const button = source instanceof HTMLElement ? source : null;
  const song = button ? songFromButton(button) : normalizeSong(source);
  const { songmid, mediaMid, title, coverUrl } = song;
  if (!songmid || !mediaMid) {
    playState.textContent = "缺少播放参数";
    return;
  }

  const params = new URLSearchParams({ songmid, mediaMid });
  if (state.sessionId) params.set("sessionId", state.sessionId);

  if (button) button.disabled = true;
  playState.textContent = `正在获取《${title}》播放地址`;
  currentTrack.textContent = title;
  setVinylCover(coverUrl);
  state.currentSong = song;
  updateTransportControl();

  try {
    let payload = await getBrowserPlayUrl(songmid, mediaMid);
    if (!payload.playable) {
      const fallback = await readJson(await fetch(`/api/play-url?${params}`));
      payload = { ...fallback, source: "server" };
    }

    if (!payload.playable) {
      playState.textContent = `不可播放：QQ 返回 result=${payload.result ?? "未知"}，${payload.tips || "未返回 purl"}`;
      heroState.textContent = "无法播放";
      return;
    }

    const proxied = await prepareAudioSource(payload.playUrl);
    updateTrackProgress();
    updateTransportControl();
    if (proxied) await setupAudioAnalyser();
    loadLyrics(songmid);
    await player.play();
    rememberPlayedSong(song);
    playState.textContent = `正在播放《${title}》`;
    heroState.textContent = "正在播放";
    setDrawer(false);
    startVisualizer();
  } catch (error) {
    playState.textContent = `播放失败：${error.message}`;
    heroState.textContent = "播放失败";
  } finally {
    if (button) button.disabled = false;
  }
}

async function togglePlaybackState() {
  if (!player.currentSrc && !player.src) return;

  try {
    if (player.paused || player.ended) {
      await player.play();
    } else {
      player.pause();
    }
    updateTransportControl();
  } catch (error) {
    playState.textContent = `播放失败：${error.message}`;
    heroState.textContent = "播放失败";
  }
}

function setVinylCover(coverUrl) {
  if (!vinylRecord) return;
  if (!coverUrl) {
    vinylRecord.classList.remove("has-cover");
    vinylRecord.style.removeProperty("--cover-image");
    return;
  }

  vinylRecord.classList.add("has-cover");
  vinylRecord.style.setProperty("--cover-image", `url("${coverUrl}")`);
}

async function loadLyrics(songmid) {
  lyricState.lines = [];
  lyricState.activeIndex = -1;
  currentLyric.textContent = "正在加载歌词";
  pinyinLyric.textContent = "";
  nextLyric.textContent = "";
  lyricsList.innerHTML = "";

  const params = new URLSearchParams({ songmid });
  if (state.sessionId) params.set("sessionId", state.sessionId);

  try {
    const payload = await readJson(await fetch(`/api/lyrics?${params}`));
    lyricState.lines = Array.isArray(payload.lines) && payload.lines.length
      ? payload.lines
      : parseLrc(payload.lyric);
    if (!lyricState.lines.length) {
      currentLyric.textContent = "暂无歌词";
      return;
    }
    lyricsList.innerHTML = lyricState.lines.map((line, index) => (
      `<p data-lyric-index="${index}">${escapeHtml(line.text)}</p>`
    )).join("");
    updateLyrics();
  } catch (error) {
    currentLyric.textContent = `歌词加载失败：${error.message}`;
  }
}

function parseLrc(lrc) {
  const lines = [];
  const rowPattern = /(\[\d{2}:\d{2}(?:\.\d{1,3})?\])+/g;
  const timePattern = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const row of String(lrc || "").split(/\r?\n/)) {
    if (!rowPattern.test(row)) continue;
    rowPattern.lastIndex = 0;
    const text = row.replace(rowPattern, "").trim();
    if (!text) continue;

    let match;
    timePattern.lastIndex = 0;
    while ((match = timePattern.exec(row))) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = Number((match[3] || "0").padEnd(3, "0"));
      lines.push({
        time: minutes * 60 + seconds + fraction / 1000,
        text
      });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

function updateLyrics() {
  if (!lyricState.lines.length) return;
  const time = player.currentTime || 0;
  let index = lyricState.lines.findIndex((line, lineIndex) => {
    const next = lyricState.lines[lineIndex + 1];
    return time >= line.time && (!next || time < next.time);
  });
  if (index < 0) index = 0;
  if (index === lyricState.activeIndex) return;

  lyricState.activeIndex = index;
  const active = lyricState.lines[index];
  const next = lyricState.lines[index + 1];
  renderAlignedLyrics(active, next);
  nextLyric.textContent = next?.text || "";

  lyricsList.querySelectorAll("p").forEach((node) => {
    const isActive = Number(node.dataset.lyricIndex) === index;
    node.classList.toggle("is-active", isActive);
    if (isActive) node.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function renderAlignedLyrics(line, nextLine) {
  if (!line?.text) {
    currentLyric.textContent = "暂无歌词";
    pinyinLyric.textContent = "";
    return;
  }

  if (!Array.isArray(line.tokens) || !line.tokens.length) {
    currentLyric.textContent = line.text;
    pinyinLyric.textContent = line.pinyin || "";
    return;
  }

  const timing = getLyricRevealTiming(line, nextLine, line.tokens.length);
  const pinyinHtml = line.tokens.map((token, index) => (
    `<span class="lyric-token" style="--token-index: ${index}; --token-step: ${timing.stepMs}ms; --token-duration: ${timing.durationMs}ms">${escapeHtml(token.pinyin || "")}</span>`
  )).join("");
  const lyricHtml = line.tokens.map((token, index) => (
    `<span class="lyric-token" style="--token-index: ${index}; --token-step: ${timing.stepMs}ms; --token-duration: ${timing.durationMs}ms">${escapeHtml(token.text || "")}</span>`
  )).join("");

  pinyinLyric.innerHTML = pinyinHtml;
  currentLyric.innerHTML = lyricHtml;
}

function getLyricRevealTiming(line, nextLine, tokenCount) {
  const fallbackStepMs = 105;
  if (!nextLine || !Number.isFinite(line.time) || !Number.isFinite(nextLine.time) || tokenCount <= 1) {
    return {
      stepMs: fallbackStepMs,
      durationMs: 620
    };
  }

  const lineDurationMs = Math.max(0, (nextLine.time - line.time) * 1000);
  const spreadMs = lineDurationMs * 0.72;
  const rawStepMs = spreadMs / Math.max(1, tokenCount - 1);
  const stepMs = Math.round(Math.min(220, Math.max(45, rawStepMs)));
  const durationMs = Math.round(Math.min(760, Math.max(360, stepMs * 4.8)));

  return { stepMs, durationMs };
}

function getBrowserPlayUrl(songmid, mediaMid) {
  const guid = String(Math.floor(1000000000 + Math.random() * 9000000000));
  const filename = `C400${mediaMid}.m4a`;
  const request = {
    req_0: {
      module: "vkey.GetVkeyServer",
      method: "CgiGetVkey",
      param: {
        guid,
        songmid: [songmid],
        filename: [filename],
        songtype: [0],
        uin: "0",
        loginflag: 1,
        platform: "20"
      }
    },
    comm: {
      uin: "0",
      format: "json",
      ct: 24,
      cv: 0
    }
  };

  return jsonp("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    callback: "callback",
    jsonpCallback: "callback",
    format: "json",
    data: JSON.stringify(request)
  }).then((payload) => normalizePlayPayload(payload, filename));
}

function normalizePlayPayload(payload, filename) {
  const data = payload?.req_0?.data || {};
  const info = data.midurlinfo?.[0] || {};
  const purl = info.purl || "";
  const hosts = [...(data.sip || []), ...(data.thirdip || [])].filter(Boolean);
  const playUrl = purl ? toHttpsUrl(new URL(purl, hosts[0] || "https://dl.stream.qqmusic.qq.com/").toString()) : "";

  return {
    playable: Boolean(playUrl),
    playUrl,
    filename: info.filename || filename,
    result: info.result,
    tips: info.tips || data.msg || "",
    source: "browser"
  };
}

function toHttpsUrl(url) {
  if (url.startsWith("http://")) return `https://${url.slice(7)}`;
  return url;
}

function toProxyAudioUrl(url) {
  return `/api/audio-proxy?url=${encodeURIComponent(url)}`;
}

async function prepareAudioSource(playUrl) {
  audioAnalysisState.enabled = false;
  visualizerState.usingRealAudio = false;
  player.dataset.directSrc = playUrl;
  player.src = toProxyAudioUrl(playUrl);
  audioAnalysisState.preparingProxy = true;
  player.load();

  try {
    await waitForPlayableSource();
    audioAnalysisState.preparingProxy = false;
    return true;
  } catch {
    audioAnalysisState.preparingProxy = false;
    player.removeAttribute("data-direct-src");
    player.src = playUrl;
    player.load();
    playState.textContent = "本地频谱代理不可用，已切回原始播放地址";
    visualizerMode.textContent = "模拟频谱";
    return false;
  }
}

function waitForPlayableSource(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      player.removeEventListener("canplay", handleCanPlay);
      player.removeEventListener("loadedmetadata", handleCanPlay);
      player.removeEventListener("error", handleError);
    };
    const handleCanPlay = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("代理音频不可播放"));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("代理音频加载超时"));
    }, timeoutMs);

    player.addEventListener("canplay", handleCanPlay, { once: true });
    player.addEventListener("loadedmetadata", handleCanPlay, { once: true });
    player.addEventListener("error", handleError, { once: true });
  });
}

async function setupAudioAnalyser() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    if (!audioAnalysisState.context) {
      audioAnalysisState.context = new AudioContextClass();
    }

    if (!audioAnalysisState.analyser) {
      audioAnalysisState.analyser = audioAnalysisState.context.createAnalyser();
      audioAnalysisState.analyser.fftSize = 512;
      audioAnalysisState.analyser.smoothingTimeConstant = 0.72;
      audioAnalysisState.frequencyData = new Uint8Array(audioAnalysisState.analyser.frequencyBinCount);
    }

    if (!audioAnalysisState.source) {
      audioAnalysisState.source = audioAnalysisState.context.createMediaElementSource(player);
      audioAnalysisState.source.connect(audioAnalysisState.analyser);
      audioAnalysisState.analyser.connect(audioAnalysisState.context.destination);
    }

    if (audioAnalysisState.context.state === "suspended") {
      await audioAnalysisState.context.resume();
    }

    audioAnalysisState.enabled = true;
    visualizerState.usingRealAudio = true;
    return true;
  } catch (error) {
    audioAnalysisState.enabled = false;
    visualizerState.usingRealAudio = false;
    setLog(`真实频谱初始化失败，已退回模拟频谱：${error.message}`);
    return false;
  }
}

function jsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `qqMusicJsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const query = new URLSearchParams(params);
    query.set("callback", callbackName);
    query.set("jsonpCallback", callbackName);

    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("浏览器侧 QQ vkey 请求失败"));
    };

    script.src = `${url}?${query}`;
    document.head.append(script);
  });
}

function startVisualizer() {
  if (!visualizerContext || visualizerState.running) return;
  resizeVisualizer();
  visualizerState.running = true;
  drawVisualizer();
}

function resizeVisualizer() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(visualizer.clientWidth * ratio));
  const height = Math.max(1, Math.floor(visualizer.clientHeight * ratio));
  if (visualizer.width !== width || visualizer.height !== height) {
    visualizer.width = width;
    visualizer.height = height;
    visualizerState.lastWidth = width;
    visualizerState.lastHeight = height;
  }
}

function drawVisualizer() {
  resizeVisualizer();
  const width = visualizer.width;
  const height = visualizer.height;
  const active = player.paused ? 0.2 : 1;
  const audioTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  const t = audioTime * 3.2 + visualizerState.frame * (player.paused ? 0.008 : 0.012);
  const realFrequencyData = getRealFrequencyData();
  visualizerContext.clearRect(0, 0, width, height);

  if (visualizerState.mode === "classic") {
    drawClassicVisualizer(width, height, active, audioTime, t, realFrequencyData);
  } else if (visualizerState.mode === "radialWave") {
    drawRadialWaveVisualizer(width, height, active, audioTime, t, realFrequencyData);
  } else {
    drawLiquidGlassVisualizer(width, height, active, audioTime, t, realFrequencyData);
  }

  updateVisualizerModeLabel(Boolean(realFrequencyData));
  visualizerState.frame += 1;
  window.requestAnimationFrame(drawVisualizer);
}

function drawClassicVisualizer(width, height, active, audioTime, t, realFrequencyData) {
  const baseline = height * 0.82;
  drawGrid(width, height);

  const bars = Math.max(56, Math.floor(width / 18));
  const gap = Math.max(4, width / 260);
  const sidePad = -gap;
  const barWidth = (width - sidePad * 2 - gap * (bars - 1)) / bars;
  visualizerState.peakCaps.length = bars;

  for (let i = 0; i < bars; i += 1) {
    const phase = i / bars;
    const wave = Math.sin(t * 1.15 + i * 0.18) * 0.5 + 0.5;
    const pulse = Math.sin(t * 1.9 + i * 0.07) * 0.5 + 0.5;
    const peak = Math.pow(Math.sin(t * 0.7 + phase * Math.PI * 8) * 0.5 + 0.5, 4);
    const stepSeed = Math.sin(i * 12.9898 + Math.floor(audioTime * 7) * 78.233) * 43758.5453;
    const stepped = (stepSeed - Math.floor(stepSeed)) * 0.32 + 0.78;
    const frequencyValue = realFrequencyData ? readFrequencyBin(realFrequencyData, phase) : 0;
    const heightValue = realFrequencyData
      ? (height * 0.035 + Math.pow(frequencyValue, 0.82) * height * 0.52) * active
      : (height * 0.12 + wave * height * 0.2 + pulse * height * 0.12 + peak * height * 0.2) * active * stepped;
    const x = sidePad + i * (barWidth + gap);
    const y = baseline - heightValue;
    const gradient = visualizerContext.createLinearGradient(x, y, x, baseline);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.62 + active * 0.26})`);
    gradient.addColorStop(0.45, `rgba(255, 255, 255, ${0.28 + active * 0.24})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.06)");
    visualizerContext.fillStyle = gradient;
    visualizerContext.fillRect(x, y, Math.max(3, barWidth), heightValue);
    drawPeakCap(i, x, y, baseline, barWidth, active, player.paused);
  }

  drawWhiteWave(width, height, baseline, active, t);
}

function drawLiquidGlassVisualizer(width, height, active, audioTime, t, realFrequencyData) {
  const surfaceTop = height * 0.46;
  const baseline = height * 0.75;
  const energy = getSpectrumEnergy(realFrequencyData, audioTime, t);
  const lowEnergy = getSpectrumBand(realFrequencyData, 0, 0.18, audioTime, t, 0.9);
  const midEnergy = getSpectrumBand(realFrequencyData, 0.18, 0.58, audioTime, t, 1.6);
  const highEnergy = getSpectrumBand(realFrequencyData, 0.58, 1, audioTime, t, 2.4);
  const playBoost = player.paused ? 0.36 : 1;

  drawGlassBackdrop(width, height, surfaceTop, lowEnergy, playBoost, t);
  drawGlassTerrain(width, height, surfaceTop, baseline, t, lowEnergy, midEnergy, highEnergy, playBoost);
  drawGlassWaveLayer(width, height, surfaceTop + height * 0.035, baseline + height * 0.035, t, lowEnergy, midEnergy, highEnergy, 0, playBoost);
  drawGlassWaveLayer(width, height, surfaceTop + height * 0.045, baseline + height * 0.055, t * 0.92 + 2.1, midEnergy, highEnergy, lowEnergy, 1, playBoost);
  drawGlassWaveLayer(width, height, surfaceTop + height * 0.085, baseline + height * 0.105, t * 0.78 + 4.4, highEnergy, lowEnergy, midEnergy, 2, playBoost);
  drawGlassRefractionLines(width, height, surfaceTop, baseline, t, energy, playBoost);
  drawGlassCaustics(width, height, baseline, t, lowEnergy, midEnergy, playBoost);
}

function drawRadialWaveVisualizer(width, height, active, audioTime, t, realFrequencyData) {
  const energy = getSpectrumEnergy(realFrequencyData, audioTime, t);
  const lowEnergy = getSpectrumBand(realFrequencyData, 0, 0.18, audioTime, t, 0.9);
  const midEnergy = getSpectrumBand(realFrequencyData, 0.18, 0.58, audioTime, t, 1.6);
  const highEnergy = getSpectrumBand(realFrequencyData, 0.58, 1, audioTime, t, 2.4);
  const playBoost = player.paused ? 0.34 : 1;
  const center = getRadialWaveCenter(width, height);

  drawRadialAmbientGlow(width, height, center, lowEnergy, playBoost, t);
  drawRadialRings(width, height, center, t, lowEnergy, midEnergy, highEnergy, playBoost);
  drawRadialGlassSpokes(width, height, center, t, energy, highEnergy, playBoost);
  drawRadialBottomEcho(width, height, t, lowEnergy, midEnergy, playBoost);
}

function getRadialWaveCenter(width, height) {
  const cssX = Math.max(92, window.innerWidth - Math.min(108, Math.max(72, window.innerWidth * 0.08)) * 0.5 - 20);
  const cssY = 18 + Math.min(108, Math.max(72, window.innerWidth * 0.08)) * 0.5;
  const scaleX = width / Math.max(1, visualizer.clientWidth);
  const scaleY = height / Math.max(1, visualizer.clientHeight);
  return {
    x: cssX * scaleX,
    y: cssY * scaleY
  };
}

function drawRadialAmbientGlow(width, height, center, lowEnergy, active, t) {
  visualizerContext.save();
  const radius = Math.min(width, height) * (0.18 + lowEnergy * 0.16);
  const glow = visualizerContext.createRadialGradient(center.x, center.y, radius * 0.12, center.x, center.y, radius * 2.4);
  glow.addColorStop(0, `rgba(235, 255, 255, ${0.12 + lowEnergy * 0.16 * active})`);
  glow.addColorStop(0.34, `rgba(40, 201, 213, ${0.045 + lowEnergy * 0.09 * active})`);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  visualizerContext.fillStyle = glow;
  visualizerContext.fillRect(0, 0, width, height);

  const sweep = visualizerContext.createLinearGradient(center.x - radius, center.y - radius, center.x + radius * 2, center.y + radius * 2);
  sweep.addColorStop(0, "rgba(255, 255, 255, 0)");
  sweep.addColorStop(0.46 + Math.sin(t * 0.24) * 0.08, `rgba(255, 255, 255, ${0.04 + lowEnergy * 0.08})`);
  sweep.addColorStop(1, "rgba(255, 255, 255, 0)");
  visualizerContext.globalCompositeOperation = "screen";
  visualizerContext.fillStyle = sweep;
  visualizerContext.fillRect(0, 0, width, height);
  visualizerContext.restore();
}

function drawRadialRings(width, height, center, t, lowEnergy, midEnergy, highEnergy, active) {
  const baseRadius = Math.min(width, height) * 0.09;
  const maxRadius = Math.min(width, height) * 0.62;
  const rings = 7;
  visualizerContext.save();
  visualizerContext.globalCompositeOperation = "screen";

  for (let ring = 0; ring < rings; ring += 1) {
    const travel = (t * (0.055 + lowEnergy * 0.035) + ring / rings) % 1;
    const radius = baseRadius + travel * maxRadius * (0.92 + lowEnergy * 0.18);
    const alpha = (1 - travel) * (0.14 + lowEnergy * 0.34) * active;
    const wobble = 0.016 + highEnergy * 0.026;
    const points = 150;

    visualizerContext.beginPath();
    for (let i = 0; i <= points; i += 1) {
      const phase = i / points;
      const angle = phase * Math.PI * 2;
      const ripple =
        Math.sin(angle * 5 + t * 1.1 + ring) * radius * wobble +
        Math.sin(angle * 13 - t * 1.7) * radius * highEnergy * 0.008;
      const r = radius + ripple;
      const x = center.x + Math.cos(angle) * r;
      const y = center.y + Math.sin(angle) * r;
      if (i === 0) visualizerContext.moveTo(x, y);
      else visualizerContext.lineTo(x, y);
    }

    const lineWidth = Math.max(1, width / 900) * (1.2 + midEnergy * 2.6) * (1 - travel * 0.45);
    visualizerContext.strokeStyle = `rgba(235, 255, 255, ${Math.min(0.46, alpha)})`;
    visualizerContext.lineWidth = lineWidth;
    visualizerContext.shadowColor = "rgba(130, 235, 255, 0.34)";
    visualizerContext.shadowBlur = 12 + lowEnergy * 26 * active;
    visualizerContext.stroke();

    if (ring % 2 === 0) {
      visualizerContext.strokeStyle = `rgba(78, 218, 236, ${Math.min(0.22, alpha * 0.58)})`;
      visualizerContext.lineWidth = Math.max(1, lineWidth * 0.42);
      visualizerContext.stroke();
    }
  }
  visualizerContext.restore();
}

function drawRadialGlassSpokes(width, height, center, t, energy, highEnergy, active) {
  const spokes = 32;
  const inner = Math.min(width, height) * 0.12;
  const outer = Math.min(width, height) * (0.34 + energy * 0.34);
  visualizerContext.save();
  visualizerContext.globalCompositeOperation = "screen";
  for (let i = 0; i < spokes; i += 1) {
    const phase = i / spokes;
    const flicker = Math.pow(Math.sin(t * 1.4 + i * 1.77) * 0.5 + 0.5, 3);
    if (flicker < 0.18 && highEnergy < 0.34) continue;
    const angle = phase * Math.PI * 2 + Math.sin(t * 0.18) * 0.08;
    const start = inner + flicker * 18;
    const end = outer * (0.64 + flicker * 0.36);
    const x1 = center.x + Math.cos(angle) * start;
    const y1 = center.y + Math.sin(angle) * start;
    const x2 = center.x + Math.cos(angle) * end;
    const y2 = center.y + Math.sin(angle) * end;
    const gradient = visualizerContext.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.38, `rgba(230, 255, 255, ${(0.035 + highEnergy * 0.12) * active * flicker})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    visualizerContext.strokeStyle = gradient;
    visualizerContext.lineWidth = Math.max(1, width / 1200);
    visualizerContext.beginPath();
    visualizerContext.moveTo(x1, y1);
    visualizerContext.lineTo(x2, y2);
    visualizerContext.stroke();
  }
  visualizerContext.restore();
}

function drawRadialBottomEcho(width, height, t, lowEnergy, midEnergy, active) {
  const baseline = height * 0.82;
  const points = 96;
  visualizerContext.save();
  visualizerContext.globalCompositeOperation = "screen";
  for (let layer = 0; layer < 3; layer += 1) {
    visualizerContext.beginPath();
    for (let i = 0; i <= points; i += 1) {
      const phase = i / points;
      const x = width * phase;
      const y = baseline + layer * height * 0.035
        + Math.sin(t * (0.45 + layer * 0.1) + phase * Math.PI * (3.2 + layer)) * height * (0.018 + lowEnergy * 0.028)
        + Math.sin(t * 1.2 + phase * Math.PI * 14) * height * midEnergy * 0.006;
      if (i === 0) visualizerContext.moveTo(x, y);
      else visualizerContext.lineTo(x, y);
    }
    visualizerContext.strokeStyle = `rgba(210, 250, 255, ${(0.06 + lowEnergy * 0.12) * active * (1 - layer * 0.22)})`;
    visualizerContext.lineWidth = Math.max(1, width / 820) * (1 + layer * 0.36);
    visualizerContext.shadowColor = "rgba(120, 235, 255, 0.22)";
    visualizerContext.shadowBlur = 10 + lowEnergy * 18;
    visualizerContext.stroke();
  }
  visualizerContext.restore();
}

function getSpectrumEnergy(realFrequencyData, audioTime, t) {
  if (realFrequencyData) {
    let sum = 0;
    const limit = Math.min(realFrequencyData.length, 96);
    for (let i = 0; i < limit; i += 1) sum += realFrequencyData[i] / 255;
    return sum / limit;
  }

  return 0.42
    + 0.24 * (Math.sin(t * 0.92) * 0.5 + 0.5)
    + 0.18 * (Math.sin(audioTime * 2.7 + 1.2) * 0.5 + 0.5);
}

function getSpectrumBand(realFrequencyData, start, end, audioTime, t, phaseOffset) {
  if (realFrequencyData) {
    const from = Math.max(0, Math.floor(realFrequencyData.length * start));
    const to = Math.max(from + 1, Math.floor(realFrequencyData.length * end));
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += realFrequencyData[i] / 255;
    return sum / (to - from);
  }

  return 0.34
    + 0.28 * (Math.sin(t * (0.72 + start) + phaseOffset) * 0.5 + 0.5)
    + 0.16 * (Math.sin(audioTime * (1.8 + end) + phaseOffset * 1.7) * 0.5 + 0.5);
}

function drawGlassBackdrop(width, height, surfaceTop, lowEnergy, active, t) {
  const glow = visualizerContext.createRadialGradient(
    width * 0.5,
    height * (0.92 - lowEnergy * 0.08),
    height * 0.04,
    width * 0.5,
    height * 0.94,
    width * (0.52 + lowEnergy * 0.16)
  );
  glow.addColorStop(0, `rgba(210, 248, 255, ${0.09 + lowEnergy * active * 0.16})`);
  glow.addColorStop(0.42, `rgba(40, 201, 213, ${0.035 + lowEnergy * active * 0.08})`);
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");

  visualizerContext.save();
  visualizerContext.fillStyle = glow;
  visualizerContext.fillRect(0, surfaceTop, width, height - surfaceTop);

  const sweep = visualizerContext.createLinearGradient(0, surfaceTop, width, height);
  sweep.addColorStop(0, "rgba(255, 255, 255, 0)");
  sweep.addColorStop(0.48 + Math.sin(t * 0.22) * 0.12, `rgba(255, 255, 255, ${0.05 + lowEnergy * 0.06})`);
  sweep.addColorStop(1, "rgba(255, 255, 255, 0)");
  visualizerContext.fillStyle = sweep;
  visualizerContext.fillRect(0, surfaceTop, width, height - surfaceTop);
  visualizerContext.restore();
}

function drawGlassTerrain(width, height, surfaceTop, baseline, t, lowEnergy, midEnergy, highEnergy, active) {
  const points = 150;
  const peakLift = height * (0.12 + lowEnergy * 0.24) * active;
  const detailLift = height * (0.018 + highEnergy * 0.055) * active;
  const lower = Math.min(height, baseline + height * 0.22);
  const terrain = [];

  for (let i = 0; i <= points; i += 1) {
    const phase = i / points;
    const x = width * phase;
    const broad =
      Math.sin(t * 0.34 + phase * Math.PI * 2.15) * 0.5 +
      Math.sin(t * 0.52 + phase * Math.PI * 3.8 + 1.4) * 0.32 +
      Math.sin(t * 0.24 + phase * Math.PI * 1.12 + 2.8) * 0.42;
    const ridges =
      Math.sin(t * 1.05 + phase * Math.PI * 12.5) * detailLift +
      Math.sin(t * 1.42 + phase * Math.PI * 23.0) * detailLift * 0.36;
    const crest = Math.pow(Math.sin(t * 0.5 + phase * Math.PI * 2.0) * 0.5 + 0.5, 2.5) * height * midEnergy * 0.06 * active;
    const y = baseline - peakLift * (0.62 + broad) - crest + ridges;
    terrain.push({ x, y });
  }

  visualizerContext.save();
  visualizerContext.beginPath();
  terrain.forEach((point, index) => {
    if (index === 0) visualizerContext.moveTo(point.x, point.y);
    else {
      const previous = terrain[index - 1];
      const cpX = (previous.x + point.x) / 2;
      visualizerContext.quadraticCurveTo(cpX, previous.y, point.x, point.y);
    }
  });
  visualizerContext.lineTo(width, lower);
  visualizerContext.lineTo(0, lower);
  visualizerContext.closePath();

  const body = visualizerContext.createLinearGradient(0, surfaceTop, 0, lower);
  body.addColorStop(0, `rgba(245, 255, 255, ${0.22 + lowEnergy * 0.18 * active})`);
  body.addColorStop(0.24, `rgba(170, 240, 255, ${0.12 + midEnergy * 0.16 * active})`);
  body.addColorStop(0.58, `rgba(49, 201, 217, ${0.035 + lowEnergy * 0.08 * active})`);
  body.addColorStop(1, "rgba(255, 255, 255, 0.012)");
  visualizerContext.fillStyle = body;
  visualizerContext.shadowColor = "rgba(185, 248, 255, 0.34)";
  visualizerContext.shadowBlur = 22 + lowEnergy * 36 * active;
  visualizerContext.fill();

  visualizerContext.globalCompositeOperation = "screen";
  visualizerContext.beginPath();
  terrain.forEach((point, index) => {
    if (index === 0) visualizerContext.moveTo(point.x, point.y);
    else visualizerContext.lineTo(point.x, point.y);
  });
  visualizerContext.strokeStyle = `rgba(250, 255, 255, ${0.34 + lowEnergy * 0.38 * active})`;
  visualizerContext.lineWidth = Math.max(1.4, width / 620);
  visualizerContext.shadowColor = "rgba(235, 255, 255, 0.48)";
  visualizerContext.shadowBlur = 12 + highEnergy * 18 * active;
  visualizerContext.stroke();

  visualizerContext.beginPath();
  terrain.forEach((point, index) => {
    const offsetY = height * (0.022 + midEnergy * 0.032) + Math.sin(t * 0.86 + index * 0.11) * height * 0.004;
    if (index === 0) visualizerContext.moveTo(point.x, point.y + offsetY);
    else visualizerContext.lineTo(point.x, point.y + offsetY);
  });
  visualizerContext.strokeStyle = `rgba(120, 235, 255, ${0.16 + highEnergy * 0.2 * active})`;
  visualizerContext.lineWidth = Math.max(1, width / 980);
  visualizerContext.shadowBlur = 10;
  visualizerContext.stroke();
  visualizerContext.restore();
}

function drawGlassWaveLayer(width, height, surfaceTop, baseline, t, primary, secondary, tertiary, layer, active) {
  const points = 132;
  const amplitude = height * (0.026 + primary * 0.072) * active * (1 - layer * 0.16);
  const drift = t * (0.28 + layer * 0.1);
  const alpha = (0.09 + primary * 0.12) * active * (1 - layer * 0.18);
  const lower = Math.min(height, baseline + height * (0.18 + layer * 0.07));

  visualizerContext.save();
  visualizerContext.beginPath();
  for (let i = 0; i <= points; i += 1) {
    const phase = i / points;
    const x = width * phase;
    const glassRipple =
      Math.sin(drift + phase * Math.PI * (2.6 + layer * 0.6)) * amplitude +
      Math.sin(t * (0.72 + layer * 0.12) + phase * Math.PI * (8.5 + layer * 1.8)) * amplitude * (0.34 + secondary * 0.22) +
      Math.sin(t * 1.18 + phase * Math.PI * 18.0) * amplitude * tertiary * 0.12;
    const y = baseline - height * (0.08 + primary * 0.12) + glassRipple;
    if (i === 0) visualizerContext.moveTo(x, y);
    else visualizerContext.lineTo(x, y);
  }
  visualizerContext.lineTo(width, lower);
  visualizerContext.lineTo(0, lower);
  visualizerContext.closePath();

  const fill = visualizerContext.createLinearGradient(0, surfaceTop, 0, lower);
  fill.addColorStop(0, `rgba(238, 254, 255, ${alpha})`);
  fill.addColorStop(0.42, `rgba(95, 220, 236, ${alpha * 0.42})`);
  fill.addColorStop(1, "rgba(255, 255, 255, 0.015)");
  visualizerContext.fillStyle = fill;
  visualizerContext.shadowColor = "rgba(165, 242, 255, 0.22)";
  visualizerContext.shadowBlur = 18 + primary * 24 * active;
  visualizerContext.fill();

  visualizerContext.globalCompositeOperation = "screen";
  visualizerContext.strokeStyle = `rgba(245, 255, 255, ${0.18 + primary * 0.28 * active})`;
  visualizerContext.lineWidth = Math.max(1, width / (720 - layer * 80));
  visualizerContext.stroke();
  visualizerContext.restore();
}

function drawGlassRefractionLines(width, height, surfaceTop, baseline, t, energy, active) {
  const lines = Math.max(18, Math.floor(width / 90));
  visualizerContext.save();
  visualizerContext.globalCompositeOperation = "screen";
  for (let i = 0; i < lines; i += 1) {
    const phase = i / lines;
    const x = width * phase + Math.sin(t * 0.36 + i * 1.9) * width * 0.018;
    const top = surfaceTop + height * (0.04 + 0.12 * (Math.sin(t * 0.24 + i) * 0.5 + 0.5));
    const lineHeight = height * (0.18 + energy * 0.24) * (0.65 + 0.35 * Math.sin(t * 0.7 + i * 2.4));
    const gradient = visualizerContext.createLinearGradient(x, top, x, top + lineHeight);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.18, `rgba(230, 255, 255, ${0.04 + energy * active * 0.12})`);
    gradient.addColorStop(0.56, `rgba(82, 217, 235, ${0.025 + energy * active * 0.06})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    visualizerContext.strokeStyle = gradient;
    visualizerContext.lineWidth = Math.max(1, width / 980);
    visualizerContext.beginPath();
    visualizerContext.moveTo(x, top);
    visualizerContext.lineTo(x + Math.sin(t + i) * 10, top + lineHeight);
    visualizerContext.stroke();
  }
  visualizerContext.restore();
}

function drawGlassCaustics(width, height, baseline, t, lowEnergy, midEnergy, active) {
  visualizerContext.save();
  visualizerContext.globalCompositeOperation = "screen";
  const bands = 8;
  for (let i = 0; i < bands; i += 1) {
    const pulseLift = Math.sin(t * 0.72 + i * 0.8) * height * lowEnergy * 0.012;
    const y = baseline + height * (0.03 + i * 0.023) + Math.sin(t * 0.42 + i) * height * 0.012 + pulseLift;
    const gradient = visualizerContext.createLinearGradient(0, y, width, y);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.2 + Math.sin(t * 0.2 + i) * 0.04, `rgba(185, 246, 255, ${(0.035 + lowEnergy * 0.14) * active})`);
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${(0.045 + midEnergy * 0.14) * active})`);
    gradient.addColorStop(0.8 + Math.cos(t * 0.18 + i) * 0.04, `rgba(95, 220, 236, ${(0.03 + lowEnergy * 0.12) * active})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    visualizerContext.strokeStyle = gradient;
    visualizerContext.lineWidth = Math.max(1, height / 330) * (1 + i * 0.09 + lowEnergy * 0.5);
    visualizerContext.beginPath();
    visualizerContext.moveTo(0, y);
    for (let x = 0; x <= width; x += width / 24) {
      const phase = x / width;
      const waveY = y + Math.sin(t * 0.56 + phase * Math.PI * 5 + i) * height * (0.004 + lowEnergy * 0.006);
      visualizerContext.lineTo(x, waveY);
    }
    visualizerContext.stroke();
  }
  visualizerContext.restore();
}

function getRealFrequencyData() {
  const analyser = audioAnalysisState.analyser;
  const data = audioAnalysisState.frequencyData;
  if (!audioAnalysisState.enabled || !analyser || !data || player.paused) return null;

  analyser.getByteFrequencyData(data);
  return data;
}

function readFrequencyBin(data, phase) {
  const curved = Math.pow(phase, 1.8);
  const index = Math.min(data.length - 1, Math.max(0, Math.floor(curved * data.length)));
  const prev = data[Math.max(0, index - 1)] || 0;
  const current = data[index] || 0;
  const next = data[Math.min(data.length - 1, index + 1)] || 0;
  return (prev * 0.25 + current * 0.5 + next * 0.25) / 255;
}

function drawPeakCap(index, x, barTop, baseline, barWidth, active, paused) {
  const capWidth = Math.max(4, barWidth * 0.92);
  const capHeight = Math.max(3, Math.min(8, capWidth * 0.38));
  const capGap = Math.max(4, capHeight * 1.15);
  const targetY = Math.max(0, barTop - capGap - capHeight);
  const floorY = baseline - capGap - capHeight;
  const cap = visualizerState.peakCaps[index] || { y: floorY, hold: 0, velocity: 0, trail: [], spark: 0, lastY: floorY };
  cap.trail ||= [];
  cap.spark ||= 0;
  cap.lastY ??= cap.y;

  if (targetY < cap.y) {
    const lift = cap.y - targetY;
    cap.y = targetY;
    cap.hold = paused ? 0 : 14;
    cap.velocity = 0;
    cap.spark = Math.min(1, Math.max(cap.spark, lift / Math.max(18, baseline * 0.08)));
  } else if (cap.hold > 0) {
    cap.hold -= 1;
  } else {
    cap.velocity = Math.min(cap.velocity + (paused ? 0.08 : 0.18), paused ? 1.1 : 3.4);
    cap.y = Math.min(floorY, cap.y + cap.velocity);
  }

  const travel = Math.abs(cap.y - cap.lastY);
  if (!paused && (travel > 0.35 || cap.spark > 0.04)) {
    cap.trail.unshift({
      y: cap.lastY,
      alpha: Math.min(1, 0.42 + travel / 7 + cap.spark * 0.36)
    });
  }
  cap.trail = cap.trail
    .slice(0, 6)
    .map((point, trailIndex) => ({
      y: point.y,
      alpha: point.alpha * (paused ? 0.5 : 0.74) * (1 - trailIndex * 0.08)
    }))
    .filter((point) => point.alpha > 0.035);
  cap.spark *= paused ? 0.6 : 0.76;
  cap.lastY = cap.y;
  visualizerState.peakCaps[index] = cap;

  visualizerContext.save();
  const left = x + (barWidth - capWidth) / 2;
  for (let trailIndex = cap.trail.length - 1; trailIndex >= 0; trailIndex -= 1) {
    const point = cap.trail[trailIndex];
    const fade = point.alpha * active * (1 - trailIndex / Math.max(7, cap.trail.length + 2));
    const trailWidth = capWidth * (1 - trailIndex * 0.045);
    const trailLeft = left + (capWidth - trailWidth) / 2;
    visualizerContext.fillStyle = `rgba(${220 + trailIndex * 4}, ${246 + trailIndex}, 255, ${Math.min(0.45, fade * 0.34)})`;
    visualizerContext.shadowColor = "rgba(120, 235, 255, 0.38)";
    visualizerContext.shadowBlur = 12 + active * 12;
    visualizerContext.fillRect(trailLeft, point.y, trailWidth, capHeight);
  }

  const sparkBoost = cap.spark * active;
  visualizerContext.fillStyle = `rgba(255, 255, 255, ${Math.min(0.98, 0.48 + active * 0.36 + sparkBoost * 0.22)})`;
  visualizerContext.shadowColor = sparkBoost > 0.08 ? "rgba(190, 250, 255, 0.78)" : "rgba(255, 255, 255, 0.58)";
  visualizerContext.shadowBlur = 10 + active * 8 + sparkBoost * 18;
  visualizerContext.fillRect(left, cap.y, capWidth, capHeight);

  if (sparkBoost > 0.12) {
    visualizerContext.fillStyle = `rgba(210, 250, 255, ${sparkBoost * 0.22})`;
    visualizerContext.fillRect(left - capWidth * 0.18, cap.y - capHeight * 0.45, capWidth * 1.36, capHeight * 1.9);
  }
  visualizerContext.restore();
}

function drawGrid(width, height) {
  visualizerContext.save();
  visualizerContext.strokeStyle = "rgba(255, 255, 255, 0.09)";
  visualizerContext.lineWidth = 1;
  const verticalStep = width / 34;
  for (let x = 0; x <= width; x += verticalStep) {
    visualizerContext.beginPath();
    visualizerContext.moveTo(x, 0);
    visualizerContext.lineTo(x, height);
    visualizerContext.stroke();
  }

  const horizontalStep = height / 5;
  for (let y = horizontalStep; y <= height; y += horizontalStep) {
    visualizerContext.beginPath();
    visualizerContext.moveTo(0, y);
    visualizerContext.lineTo(width, y);
    visualizerContext.stroke();
  }
  visualizerContext.restore();
}

function drawWhiteWave(width, height, baseline, active, t) {
  const points = 96;
  visualizerContext.save();
  visualizerContext.beginPath();
  for (let i = 0; i <= points; i += 1) {
    const x = (width * i) / points;
    const phase = i / points;
    const y = baseline - height * (0.34 + 0.09 * Math.sin(t * 0.45 + phase * Math.PI * 3.2) + 0.045 * Math.sin(t * 1.2 + phase * Math.PI * 15));
    if (i === 0) visualizerContext.moveTo(x, y);
    else {
      const prevX = (width * (i - 1)) / points;
      const cpX = (prevX + x) / 2;
      visualizerContext.quadraticCurveTo(cpX, y, x, y);
    }
  }
  visualizerContext.strokeStyle = `rgba(255, 255, 255, ${0.42 + active * 0.32})`;
  visualizerContext.lineWidth = Math.max(1.5, width / 520);
  visualizerContext.shadowColor = "rgba(255, 255, 255, 0.5)";
  visualizerContext.shadowBlur = 10;
  visualizerContext.stroke();
  visualizerContext.restore();
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

officialLogin.addEventListener("click", () => {
  window.open(officialLoginUrl, "_blank", "noopener");
  loginState.textContent = "请在 QQ 音乐官方页登录";
  setLog("已打开 QQ 音乐官方个人页。登录完成后回到本页播放。");
});

trackProgress.addEventListener("pointerdown", (event) => {
  seekState.dragging = true;
  trackProgress.classList.add("is-dragging");
  trackProgress.setPointerCapture(event.pointerId);
  seekByPointer(event);
});

trackProgress.addEventListener("pointermove", (event) => {
  if (seekState.dragging) seekByPointer(event);
});

trackProgress.addEventListener("pointerup", (event) => {
  seekState.dragging = false;
  trackProgress.classList.remove("is-dragging");
  if (trackProgress.hasPointerCapture(event.pointerId)) {
    trackProgress.releasePointerCapture(event.pointerId);
  }
});

trackProgress.addEventListener("pointercancel", (event) => {
  seekState.dragging = false;
  trackProgress.classList.remove("is-dragging");
  if (trackProgress.hasPointerCapture(event.pointerId)) {
    trackProgress.releasePointerCapture(event.pointerId);
  }
});

trackProgress.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    seekByOffset(-5);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    seekByOffset(5);
  } else if (event.key === "Home") {
    event.preventDefault();
    if (player.duration) {
      player.currentTime = 0;
      updateTrackProgress();
      updateLyrics();
    }
  } else if (event.key === "End") {
    event.preventDefault();
    if (player.duration) {
      player.currentTime = player.duration;
      updateTrackProgress();
      updateLyrics();
    }
  }
});

toggleSearch?.addEventListener("click", () => toggleDrawerPanel("search"));
toggleHistory?.addEventListener("click", () => toggleDrawerPanel("history"));
closeResults.addEventListener("click", () => setDrawer(false));
searchForm.addEventListener("submit", search);
keyword.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setDrawer(false);
    toggleSearch?.focus();
  }
});
toggleVisualizer?.addEventListener("click", () => {
  const nextMode = {
    liquidGlass: "radialWave",
    radialWave: "classic",
    classic: "liquidGlass"
  }[visualizerState.mode] || "liquidGlass";
  setVisualizerMode(nextMode);
});
togglePlayback?.addEventListener("click", togglePlaybackState);
results.addEventListener("click", (event) => {
  const button = event.target.closest(".play-btn");
  if (button) playSong(button);
});
historyList?.addEventListener("click", (event) => {
  const button = event.target.closest(".history-play");
  if (!button) return;
  playHistoryAt(Number(button.dataset.historyIndex));
});
playHistory?.addEventListener("click", () => {
  playHistoryAt(0);
});
clearHistory?.addEventListener("click", () => {
  state.playbackHistory = [];
  state.currentHistoryIndex = -1;
  savePlaybackHistory();
  renderPlaybackHistory();
  playState.textContent = "播放历史已清空";
});

player.addEventListener("pause", () => {
  heroState.textContent = "已暂停";
  updateTrackProgress();
  updateTransportControl();
});

player.addEventListener("play", () => {
  heroState.textContent = "正在播放";
  updateTrackProgress();
  updateTransportControl();
  startVisualizer();
});

player.addEventListener("timeupdate", () => {
  updateLyrics();
  updateTrackProgress();
});
player.addEventListener("loadedmetadata", updateTrackProgress);
player.addEventListener("durationchange", updateTrackProgress);
player.addEventListener("ended", () => {
  updateTrackProgress();
  updateTransportControl();
  playNextHistorySong();
});

player.addEventListener("error", () => {
  if (audioAnalysisState.preparingProxy) return;

  const directSrc = player.dataset.directSrc;
  const isProxySrc = player.currentSrc.includes("/api/audio-proxy");
  if (isProxySrc && directSrc) {
    audioAnalysisState.enabled = false;
    visualizerState.usingRealAudio = false;
    player.removeAttribute("data-direct-src");
    player.src = directSrc;
    player.load();
    player.play().catch((error) => {
      playState.textContent = `播放失败：${error.message}`;
      heroState.textContent = "播放失败";
    });
    playState.textContent = "本地频谱代理失败，已切回原始播放地址";
    visualizerMode.textContent = "模拟频谱";
    updateTransportControl();
    return;
  }

  const error = player.error;
  if (error) {
    playState.textContent = `播放失败：音频错误 code=${error.code}`;
    heroState.textContent = "播放失败";
    updateTransportControl();
  }
});

window.addEventListener("resize", resizeVisualizer);

loadWeather();
setActivePanel("search");
renderPlaybackHistory();
updateVisualizerModeLabel(false);
startVisualizer();
updateTransportControl();
