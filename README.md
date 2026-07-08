# QQ 音乐扫码登录与搜索接口复现

这个本地项目复现了 `https://y.qq.com/?ADTAG=myqq&redirecttag=mn.redirect.custom&mnst=1.40` 中最核心的两条链路：QQ 扫码登录和歌曲搜索。

## 运行

```bash
npm install
npm start
```

打开 `http://localhost:5174`。

桌面版可以用 Electron 直接打开同一套本地服务：

```bash
npm run electron
```

打包 Windows 安装包和便携版：

```bash
npm run dist
```

打包产物会输出到 `dist/`。Electron 启动时会自动启动本地 Express 服务；如果已经配置了 `local.y.qq.com` 证书，会优先加载 `https://local.y.qq.com:5174`，否则加载 `http://localhost:5174`。

如果要让浏览器尽量携带 QQ 音乐登录 cookie 来取有权限歌曲的播放地址，请改用本地 QQ 子域 HTTPS：

```powershell
.\scripts\setup-local-qq-host.ps1
npm start
```

然后打开 `https://local.y.qq.com:5174`。这个脚本会添加 `127.0.0.1 local.y.qq.com` 到 hosts，并在当前用户下创建/信任本地开发证书。

如果 5174 被占用，可以指定端口：

```bash
$env:PORT=5175; npm start
```

## 登录逻辑

页面现在提供两种登录入口：

- 推荐入口：点击“打开 QQ 音乐官方页”，在 QQ 音乐官方个人页点击登录并扫码。扫码成功后，浏览器会在 QQ 域下保存你的登录态；播放时会优先用浏览器侧 JSONP 请求 QQ 的 vkey 接口，以便携带你的 QQ 音乐 cookie。
- 调试入口：“调试服务端二维码”用于观察 `xlogin -> ptqrshow -> ptqrlogin` 接口链路。当前环境下服务端轮询 `ptqrlogin` 会被 QQ 返回 HTTP 403，所以这个二维码不适合作为真实登录入口。

1. `GET https://xui.ptlogin2.qq.com/cgi-bin/xlogin`
   初始化登录页，拿到 `pt_login_sig` 等 cookie。
2. `GET https://ssl.ptlogin2.qq.com/ptqrshow`
   返回二维码 PNG，同时设置 `qrsig` cookie。
3. 用 `qrsig` 计算 `ptqrtoken`：

   ```js
   let hash = 0;
   for (const ch of qrsig) {
     hash += (hash << 5) + ch.charCodeAt(0);
     hash &= 0x7fffffff;
   }
   ```

4. `GET https://ssl.ptlogin2.qq.com/ptqrlogin`
   携带 `ptqrtoken`、`login_sig`、`appid=716027609`、`daid=383`、`pt_3rd_aid=100497308` 轮询。
5. 返回码常见含义：
   - `66`：二维码未扫描
   - `67`：已扫码，等待手机确认
   - `65`：二维码已过期
   - `0`：登录成功，响应中会带 `check_sig` 跳转地址
6. 成功后服务端继续请求 `check_sig` 地址，落最终 cookie。

当前环境实测：`xlogin` 和 `ptqrshow` 可以从本地 Node 服务端正常请求，`ptqrlogin` 轮询会被 QQ 返回 HTTP 403 空响应。项目会把 `httpStatus`、`ptqrtoken` 和 cookie 名称显示出来，方便继续排查。真实登录请使用页面上的“打开 QQ 音乐官方页”。

## 搜索逻辑

请求：

```text
GET https://c.y.qq.com/soso/fcgi-bin/client_search_cp
```

核心参数：

```text
p=1
n=10
w=周杰伦
format=json
cr=1
g_tk=5381
```

搜索接口匿名也能返回结果。这个项目会通过本地 `/api/search` 代理真实请求，并在传入 `sessionId` 时复用同一个登录 cookie jar。

## 播放地址逻辑

搜索结果会返回 `songmid` 和 `mediaMid`。点击播放时，页面优先通过浏览器 JSONP 请求：

```text
POST https://u.y.qq.com/cgi-bin/musicu.fcg
```

核心模块：

```json
{
  "module": "vkey.GetVkeyServer",
  "method": "CgiGetVkey"
}
```

关键参数：

```text
songmid=[搜索结果 songmid]
filename=C400[mediaMid].m4a
guid=随机数字
uin=0
platform=20
```

如果返回 `midurlinfo[0].purl`，页面会用 `sip[0] + purl` 放进 `<audio>` 播放。很多歌曲会返回空 `purl`，例如匿名状态下需要版权、会员或登录权益的歌曲，这时页面会显示 QQ 返回的 `result` 码。

如果浏览器侧请求没有拿到 `purl`，页面会再调用本地 `/api/play-url` 做匿名兜底。若你已经有播放权限但仍为空，优先检查官方登录是否完成，以及浏览器是否禁用了第三方 Cookie。
