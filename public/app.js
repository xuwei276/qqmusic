const state = {
  sessionId: "",
  drawerOpen: false
};

const loginState = document.querySelector("#loginState");
const loginLog = document.querySelector("#loginLog");
const weatherIcon = document.querySelector("#weatherIcon");
const weatherCity = document.querySelector("#weatherCity");
const weatherText = document.querySelector("#weatherText");
const officialLogin = document.querySelector("#officialLogin");
const officialHome = document.querySelector("#officialHome");
const checkOfficialLogin = document.querySelector("#checkOfficialLogin");
const searchForm = document.querySelector("#searchForm");
const keyword = document.querySelector("#keyword");
const searchState = document.querySelector("#searchState");
const results = document.querySelector("#results");
const resultsDrawer = document.querySelector("#resultsDrawer");
const toggleResults = document.querySelector("#toggleResults");
const closeResults = document.querySelector("#closeResults");
const player = document.querySelector("#player");
const playState = document.querySelector("#playState");
const heroState = document.querySelector("#heroState");
const currentTrack = document.querySelector("#currentTrack");
const pinyinLyric = document.querySelector("#pinyinLyric");
const currentLyric = document.querySelector("#currentLyric");
const nextLyric = document.querySelector("#nextLyric");
const lyricsList = document.querySelector("#lyricsList");
const visualizerMode = document.querySelector("#visualizerMode");
const trackProgress = document.querySelector("#trackProgress");
const trackProgressFill = document.querySelector("#trackProgressFill");
const trackTime = document.querySelector("#trackTime");
const visualizer = document.querySelector("#visualizer");
const visualizerContext = visualizer.getContext("2d");

const officialLoginUrl = "https://y.qq.com/n/ryqq_v2/profile";
const officialHomeUrl = "https://y.qq.com/";
const visualizerState = {
  frame: 0,
  running: false,
  lastWidth: 0,
  lastHeight: 0,
  usingRealAudio: false
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

function setDrawer(open) {
  state.drawerOpen = open;
  resultsDrawer.classList.toggle("is-open", open);
  toggleResults.setAttribute("aria-expanded", String(open));
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minute = Math.floor(seconds / 60);
  const second = String(seconds % 60).padStart(2, "0");
  return `${minute}:${second}`;
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
        >播放</button>
      </article>
    `).join("");
  } catch (error) {
    searchState.textContent = "搜索失败";
    results.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
}

async function playSong(button) {
  const songmid = button.dataset.songmid;
  const mediaMid = button.dataset.mediaMid;
  const title = button.dataset.title;
  if (!songmid || !mediaMid) {
    playState.textContent = "缺少播放参数";
    return;
  }

  const params = new URLSearchParams({ songmid, mediaMid });
  if (state.sessionId) params.set("sessionId", state.sessionId);

  button.disabled = true;
  playState.textContent = `正在获取《${title}》播放地址`;
  currentTrack.textContent = title;

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
    if (proxied) await setupAudioAnalyser();
    loadLyrics(songmid);
    await player.play();
    playState.textContent = `正在播放《${title}》`;
    heroState.textContent = "正在播放";
    setDrawer(false);
    startVisualizer();
  } catch (error) {
    playState.textContent = `播放失败：${error.message}`;
    heroState.textContent = "播放失败";
  } finally {
    button.disabled = false;
  }
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
  renderAlignedLyrics(active);
  nextLyric.textContent = next?.text || "";

  lyricsList.querySelectorAll("p").forEach((node) => {
    const isActive = Number(node.dataset.lyricIndex) === index;
    node.classList.toggle("is-active", isActive);
    if (isActive) node.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function renderAlignedLyrics(line) {
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

  const pinyinHtml = line.tokens.map((token) => (
    `<span class="lyric-token">${escapeHtml(token.pinyin || "")}</span>`
  )).join("");
  const lyricHtml = line.tokens.map((token) => (
    `<span class="lyric-token">${escapeHtml(token.text || "")}</span>`
  )).join("");

  pinyinLyric.innerHTML = pinyinHtml;
  currentLyric.innerHTML = lyricHtml;
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
  const baseline = height * 0.82;
  const active = player.paused ? 0.2 : 1;
  const audioTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  const t = audioTime * 3.2 + visualizerState.frame * (player.paused ? 0.008 : 0.012);
  const realFrequencyData = getRealFrequencyData();
  visualizerContext.clearRect(0, 0, width, height);

  drawGrid(width, height);

  const bars = Math.max(56, Math.floor(width / 18));
  const gap = Math.max(4, width / 260);
  const sidePad = -gap;
  const barWidth = (width - sidePad * 2 - gap * (bars - 1)) / bars;

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
  }

  drawWhiteWave(width, height, baseline, active, t);

  visualizerMode.textContent = realFrequencyData ? "真实频谱" : (player.paused ? "低频待机" : "模拟频谱");
  visualizerState.frame += 1;
  window.requestAnimationFrame(drawVisualizer);
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

officialHome.addEventListener("click", () => {
  window.open(officialHomeUrl, "_blank", "noopener");
  loginState.textContent = "请在 QQ 音乐首页登录";
  setLog("已打开 QQ 音乐首页。登录完成后回到本页播放。");
});

checkOfficialLogin.addEventListener("click", () => {
  loginState.textContent = "将使用浏览器 QQ 登录态取播放地址";
  setLog("如果仍提示 purl 为空，请确认官方页已登录，且当前页面为 https://local.y.qq.com:5174。");
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

toggleResults.addEventListener("click", () => setDrawer(!state.drawerOpen));
closeResults.addEventListener("click", () => setDrawer(false));
searchForm.addEventListener("submit", search);
results.addEventListener("click", (event) => {
  const button = event.target.closest(".play-btn");
  if (button) playSong(button);
});

player.addEventListener("pause", () => {
  heroState.textContent = "已暂停";
  updateTrackProgress();
});

player.addEventListener("play", () => {
  heroState.textContent = "正在播放";
  updateTrackProgress();
  startVisualizer();
});

player.addEventListener("timeupdate", () => {
  updateLyrics();
  updateTrackProgress();
});
player.addEventListener("loadedmetadata", updateTrackProgress);
player.addEventListener("durationchange", updateTrackProgress);
player.addEventListener("ended", updateTrackProgress);

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
    return;
  }

  const error = player.error;
  if (error) {
    playState.textContent = `播放失败：音频错误 code=${error.code}`;
    heroState.textContent = "播放失败";
  }
});

window.addEventListener("resize", resizeVisualizer);

loadWeather();
startVisualizer();
