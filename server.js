import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import express from "express";
import { pinyin } from "pinyin-pro";

const app = express();
const port = process.env.PORT || 5174;
const httpsPort = process.env.HTTPS_PORT || port;
const localPfxPath = new URL("./certs/local.y.qq.com.pfx", import.meta.url);
const localPfxPassphrase = "qqmusic-local";

const QQ_MUSIC_APPID = "716027609";
const QQ_MUSIC_DAID = "383";
const QQ_MUSIC_3RD_AID = "100497308";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const sessions = new Map();

app.use(express.static("public"));

function parseLrcLines(lrc) {
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
        text,
        pinyin: lyricToPinyin(text),
        tokens: lyricToTokens(text)
      });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

function lyricToPinyin(text) {
  return lyricToTokens(text).map((token) => token.pinyin).filter(Boolean).join(" ");
}

function lyricToTokens(text) {
  const source = String(text || "").replace(/\([^)]*\)/g, "");
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/[\u4e00-\u9fa5]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[\u4e00-\u9fa5]/.test(source[end])) end += 1;
      const word = source.slice(index, end);
      const pinyinList = pinyin(word, {
        toneType: "symbol",
        type: "array",
        nonZh: "removed"
      });

      Array.from(word).forEach((wordChar, wordIndex) => {
        tokens.push({
          text: wordChar,
          pinyin: pinyinList[wordIndex] || ""
        });
      });
      index = end;
      continue;
    }

    if (/[a-zA-Z0-9]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[a-zA-Z0-9]/.test(source[end])) end += 1;
      const word = source.slice(index, end);
      tokens.push({
        text: word,
        pinyin: word.toLowerCase()
      });
      index = end;
      continue;
    }

    index += 1;
  }

  return tokens;
}

function assertAllowedAudioUrl(rawUrl) {
  let target;
  try {
    target = new URL(String(rawUrl || ""));
  } catch {
    const error = new Error("音频地址无效。");
    error.status = 400;
    throw error;
  }

  const hostname = target.hostname.toLowerCase();
  const allowed = ["https:", "http:"].includes(target.protocol) && (
    hostname === "qqmusic.qq.com" ||
    hostname.endsWith(".qqmusic.qq.com") ||
    hostname === "music.tc.qq.com" ||
    hostname.endsWith(".music.tc.qq.com") ||
    hostname.endsWith(".qq.com") ||
    hostname.endsWith(".myqcloud.com")
  );

  if (!allowed) {
    const error = new Error("只允许代理 QQ 音乐音频地址。");
    error.status = 403;
    throw error;
  }

  return target;
}

function weatherCodeToText(code) {
  const weatherMap = new Map([
    [0, "Clear"],
    [1, "Mainly clear"],
    [2, "Partly cloudy"],
    [3, "Cloudy"],
    [45, "Fog"],
    [48, "Rime fog"],
    [51, "Light drizzle"],
    [53, "Drizzle"],
    [55, "Heavy drizzle"],
    [61, "Light rain"],
    [63, "Rain"],
    [65, "Heavy rain"],
    [71, "Light snow"],
    [73, "Snow"],
    [75, "Heavy snow"],
    [80, "Rain showers"],
    [81, "Rain showers"],
    [82, "Heavy showers"],
    [95, "Thunderstorm"],
    [96, "Thunderstorm"],
    [99, "Thunderstorm"]
  ]);
  return weatherMap.get(Number(code)) || "Weather";
}

function weatherCodeToIcon(code, isDay = 1) {
  const value = Number(code);
  if (value === 0) return Number(isDay) ? "☀" : "☾";
  if ([1, 2].includes(value)) return Number(isDay) ? "⛅" : "☁";
  if ([3, 45, 48].includes(value)) return "☁";
  if ((value >= 51 && value <= 67) || (value >= 80 && value <= 82)) return "☔";
  if (value >= 71 && value <= 77) return "❄";
  if (value >= 95) return "⚡";
  return "☁";
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFromHeaders(headers) {
    const raw = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : splitSetCookie(headers.get("set-cookie"));

    for (const item of raw) {
      const first = item.split(";")[0];
      const eq = first.indexOf("=");
      if (eq > 0) {
        this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
      }
    }
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  get(name) {
    return this.cookies.get(name);
  }

  publicSnapshot() {
    return Array.from(this.cookies.keys()).sort();
  }
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/g).map((part) => part.trim());
}

function hash33(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash += (hash << 5) + input.charCodeAt(i);
    hash &= 0x7fffffff;
  }
  return hash;
}

function ptuiParse(text) {
  const match = text.match(/ptuiCB\((.*)\)/);
  if (!match) return { raw: text };
  const values = [];
  const re = /'([^']*)'/g;
  let part;
  while ((part = re.exec(match[1]))) values.push(part[1]);
  return {
    code: values[0],
    subCode: values[1],
    redirectUrl: values[2],
    message: values[4],
    nickname: values[5],
    raw: text
  };
}

async function qqFetch(url, jar, options = {}) {
  const headers = {
    "user-agent": USER_AGENT,
    "accept": options.accept || "*/*",
    "referer": options.referer || "https://y.qq.com/",
    "cookie": jar?.header() || "",
    ...options.headers
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    body: options.body,
    redirect: options.redirect || "manual",
    headers
  });
  jar?.setFromHeaders(response.headers);
  return response;
}

async function followRedirects(url, jar, referer) {
  let current = url;
  const hops = [];

  for (let i = 0; i < 8; i += 1) {
    const response = await qqFetch(current, jar, { referer, redirect: "manual" });
    hops.push({ url: current, status: response.status });
    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) {
      return hops;
    }
    current = new URL(location, current).toString();
    referer = current;
  }

  return hops;
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) {
    const error = new Error("登录会话不存在或已过期，请重新获取二维码。");
    error.status = 404;
    throw error;
  }
  return session;
}

app.get("/api/login/qr", async (_req, res, next) => {
  try {
    const jar = new CookieJar();
    const sessionId = crypto.randomUUID();

    const xlogin = new URL("https://xui.ptlogin2.qq.com/cgi-bin/xlogin");
    xlogin.search = new URLSearchParams({
      appid: QQ_MUSIC_APPID,
      daid: QQ_MUSIC_DAID,
      style: "33",
      login_text: "登录",
      hide_title_bar: "1",
      hide_border: "1",
      target: "self",
      s_url: "https://y.qq.com/portal/profile.html",
      pt_3rd_aid: QQ_MUSIC_3RD_AID,
      pt_feedback_link: "https://support.qq.com/products/36448",
      theme: "2",
      verify_theme: ""
    }).toString();

    await qqFetch(xlogin, jar);

    const qrUrl = new URL("https://ssl.ptlogin2.qq.com/ptqrshow");
    qrUrl.search = new URLSearchParams({
      appid: QQ_MUSIC_APPID,
      e: "2",
      l: "M",
      s: "3",
      d: "72",
      v: "4",
      t: String(Math.random()),
      daid: QQ_MUSIC_DAID,
      pt_3rd_aid: QQ_MUSIC_3RD_AID
    }).toString();

    const qrResponse = await qqFetch(qrUrl, jar, {
      referer: "https://xui.ptlogin2.qq.com/",
      accept: "image/*"
    });
    const qrBuffer = Buffer.from(await qrResponse.arrayBuffer());

    sessions.set(sessionId, {
      jar,
      createdAt: Date.now(),
      loginSig: jar.get("pt_login_sig"),
      qrsig: jar.get("qrsig"),
      lastPoll: null,
      loggedIn: false
    });

    res.json({
      sessionId,
      qr: `data:image/png;base64,${qrBuffer.toString("base64")}`,
      cookies: jar.publicSnapshot()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/login/poll", async (req, res, next) => {
  try {
    const session = getSession(req.query.sessionId);
    if (!session.qrsig) throw new Error("当前会话没有 qrsig，无法轮询二维码。");

    const ptqrtoken = hash33(session.qrsig);
    const pollUrl = new URL("https://ssl.ptlogin2.qq.com/ptqrlogin");
    pollUrl.search = new URLSearchParams({
      u1: "https://y.qq.com/portal/profile.html",
      ptqrtoken: String(ptqrtoken),
      ptredirect: "0",
      h: "1",
      t: "1",
      g: "1",
      from_ui: "1",
      ptlang: "2052",
      action: `0-0-${Date.now()}`,
      js_ver: "26030415",
      js_type: "1",
      login_sig: session.loginSig || "",
      pt_uistyle: "40",
      aid: QQ_MUSIC_APPID,
      daid: QQ_MUSIC_DAID,
      pt_3rd_aid: QQ_MUSIC_3RD_AID
    }).toString();

    const response = await qqFetch(pollUrl, session.jar, {
      referer: "https://xui.ptlogin2.qq.com/"
    });
    const parsed = ptuiParse(await response.text());
    parsed.httpStatus = response.status;
    parsed.ptqrtoken = ptqrtoken;
    session.lastPoll = parsed;

    let redirectHops = [];
    if (parsed.code === "0" && parsed.redirectUrl) {
      redirectHops = await followRedirects(parsed.redirectUrl, session.jar, "https://xui.ptlogin2.qq.com/");
      session.loggedIn = true;
    }

    res.json({
      ...parsed,
      loggedIn: session.loggedIn,
      redirectHops,
      cookies: session.jar.publicSnapshot()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/search", async (req, res, next) => {
  try {
    const keyword = String(req.query.q || "").trim();
    if (!keyword) {
      res.status(400).json({ error: "请输入搜索关键词。" });
      return;
    }

    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || "10", 10)));
    const session = req.query.sessionId ? sessions.get(String(req.query.sessionId)) : null;
    const jar = session?.jar || new CookieJar();

    const url = new URL("https://c.y.qq.com/soso/fcgi-bin/client_search_cp");
    url.search = new URLSearchParams({
      p: String(page),
      n: String(limit),
      w: keyword,
      format: "json",
      cr: "1",
      g_tk: "5381"
    }).toString();

    const response = await qqFetch(url, jar, {
      referer: "https://y.qq.com/",
      accept: "application/json,text/plain,*/*"
    });
    const payload = await response.json();
    const list = payload?.data?.song?.list || [];

    res.json({
      code: payload.code,
      keyword: payload?.data?.keyword || keyword,
      total: payload?.data?.song?.totalnum || 0,
      page,
      limit,
      loggedIn: Boolean(session?.loggedIn),
      songs: list.map((song) => ({
        songid: song.songid,
        songmid: song.songmid,
        mediaMid: song.strMediaMid || song.media_mid,
        songname: song.songname,
        albumname: song.albumname,
        albummid: song.albummid,
        coverUrl: song.albummid ? `https://y.qq.com/music/photo_new/T002R300x300M000${song.albummid}.jpg` : "",
        interval: song.interval,
        singers: (song.singer || []).map((item) => item.name),
        payplay: song.pay?.payplay,
        url: `https://y.qq.com/n/ryqq/songDetail/${song.songmid}`
      })),
      raw: payload
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/play-url", async (req, res, next) => {
  try {
    const songmid = String(req.query.songmid || "").trim();
    const mediaMid = String(req.query.mediaMid || "").trim();
    if (!songmid || !mediaMid) {
      res.status(400).json({ error: "缺少 songmid 或 mediaMid。" });
      return;
    }

    const session = req.query.sessionId ? sessions.get(String(req.query.sessionId)) : null;
    const jar = session?.jar || new CookieJar();
    const guid = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const filename = `C400${mediaMid}.m4a`;

    const body = JSON.stringify({
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
    });

    const response = await qqFetch("https://u.y.qq.com/cgi-bin/musicu.fcg", jar, {
      method: "POST",
      body,
      referer: "https://y.qq.com/",
      accept: "application/json,text/plain,*/*",
      headers: {
        "content-type": "application/json"
      }
    });
    const payload = await response.json();
    const data = payload?.req_0?.data || {};
    const info = data.midurlinfo?.[0] || {};
    const purl = info.purl || "";
    const hosts = [...(data.sip || []), ...(data.thirdip || [])].filter(Boolean);
    const playUrl = purl ? new URL(purl, hosts[0] || "https://dl.stream.qqmusic.qq.com/").toString().replace(/^http:\/\//, "https://") : "";

    res.json({
      code: payload.code,
      httpStatus: response.status,
      playable: Boolean(playUrl),
      playUrl,
      filename: info.filename || filename,
      result: info.result,
      tips: info.tips || data.msg || "",
      expiration: data.expiration,
      raw: payload
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/audio-proxy", async (req, res, next) => {
  try {
    const target = assertAllowedAudioUrl(req.query.url);
    const headers = {
      "user-agent": USER_AGENT,
      "accept": "*/*",
      "referer": "https://y.qq.com/",
      "origin": "https://y.qq.com"
    };
    if (req.headers.range) headers.range = req.headers.range;

    const upstream = await fetch(target, {
      method: "GET",
      redirect: "follow",
      headers
    });
    if (upstream.url) assertAllowedAudioUrl(upstream.url);

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      res.status(upstream.status).json({
        error: "QQ 音频代理请求失败。",
        status: upstream.status,
        statusText: upstream.statusText,
        url: upstream.url || target.toString(),
        detail: detail.slice(0, 300)
      });
      return;
    }

    res.status(upstream.status);
    for (const header of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag"
    ]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.setHeader("cache-control", "no-store");

    if (!upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body).on("error", next).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get("/api/weather", async (req, res, next) => {
  try {
    const city = String(req.query.city || "Shanghai").trim();
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.search = new URLSearchParams({
      name: city,
      count: "1",
      language: "zh",
      format: "json"
    }).toString();

    const geoResponse = await fetch(geoUrl, {
      headers: { "user-agent": USER_AGENT, "accept": "application/json" }
    });
    const geoPayload = await geoResponse.json();
    const place = geoPayload?.results?.[0];
    if (!place) {
      res.status(404).json({ error: "没有找到该城市天气。" });
      return;
    }

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: "temperature_2m,weather_code,is_day",
      timezone: "auto"
    }).toString();

    const weatherResponse = await fetch(weatherUrl, {
      headers: { "user-agent": USER_AGENT, "accept": "application/json" }
    });
    const weatherPayload = await weatherResponse.json();
    const current = weatherPayload.current || {};
    const code = current.weather_code;

    res.json({
      city: place.name || city,
      country: place.country || "",
      admin1: place.admin1 || "",
      latitude: place.latitude,
      longitude: place.longitude,
      time: current.time || "",
      temperature: current.temperature_2m,
      temperatureUnit: weatherPayload.current_units?.temperature_2m || "°C",
      weatherCode: code,
      description: weatherCodeToText(code),
      icon: weatherCodeToIcon(code, current.is_day),
      source: "Open-Meteo",
      sourceUrl: "https://open-meteo.com/"
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/lyrics", async (req, res, next) => {
  try {
    const songmid = String(req.query.songmid || "").trim();
    if (!songmid) {
      res.status(400).json({ error: "缺少 songmid。" });
      return;
    }

    const session = req.query.sessionId ? sessions.get(String(req.query.sessionId)) : null;
    const jar = session?.jar || new CookieJar();
    const url = new URL("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg");
    url.search = new URLSearchParams({
      songmid,
      format: "json",
      nobase64: "1",
      g_tk: "5381"
    }).toString();

    const response = await qqFetch(url, jar, {
      referer: "https://y.qq.com/",
      accept: "application/json,text/plain,*/*"
    });
    const payload = await response.json();

    const lyric = payload.lyric || "";

    res.json({
      code: payload.code,
      retcode: payload.retcode,
      subcode: payload.subcode,
      lyric,
      lines: parseLrcLines(lyric),
      trans: payload.trans || ""
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/debug/sessions/:id", (req, res, next) => {
  try {
    const session = getSession(req.params.id);
    res.json({
      createdAt: session.createdAt,
      loggedIn: session.loggedIn,
      lastPoll: session.lastPoll,
      cookies: session.jar.publicSnapshot()
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({
    error: error.message || "服务端请求失败。"
  });
});

if (fs.existsSync(localPfxPath)) {
  https.createServer({
    pfx: fs.readFileSync(localPfxPath),
    passphrase: localPfxPassphrase
  }, app).listen(httpsPort, () => {
    console.log(`QQ Music demo is running at https://local.y.qq.com:${httpsPort}`);
  });
} else {
  http.createServer(app).listen(port, () => {
    console.log(`QQ Music demo is running at http://localhost:${port}`);
    console.log("For logged-in QQ Music playback, run scripts/setup-local-qq-host.ps1 and open https://local.y.qq.com:5174");
  });
}
