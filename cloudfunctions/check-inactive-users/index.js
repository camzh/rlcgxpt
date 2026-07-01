const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || "";
const BACKEND_BASE = process.env.BACKEND_BASE || "https://rlcgxpt.com";
const TM_STALE = process.env.TM_STALE || ""; // 复用逾期/未访问模板

let _cachedToken = null;
let _tokenExpireAt = 0;

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpireAt - 60000) return _cachedToken;
  const appId = process.env.WX_APP_ID || "";
  const appSecret = process.env.WX_APP_SECRET || "";
  if (!appId || !appSecret) throw new Error("微信配置缺失");
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const res = await cloud.cloudRequest({ url, method: "GET" });
  if (!res.data || !res.data.access_token) throw new Error("获取 access_token 失败");
  _cachedToken = res.data.access_token;
  _tokenExpireAt = Date.now() + (res.data.expires_in || 7200) * 1000;
  return _cachedToken;
}

async function sendSubscribeMessage(openid, templateId, data, page) {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/bizsend?access_token=${token}`;
  const payload = { touser: openid, template_id: templateId, data };
  if (page) payload.page = page;
  const res = await cloud.cloudRequest({ url, method: "POST", data: payload });
  if (res.data && res.data.errcode && res.data.errcode !== 0) {
    console.warn(`send fail: openid=${openid}, errcode=${res.data.errcode}`);
    return false;
  }
  return true;
}

async function fetchInactiveUsers() {
  const url = `${BACKEND_BASE}/api/mini/subscribe/inactive-users`;
  const res = await cloud.cloudRequest({
    url,
    method: "POST",
    header: { "x-admin-secret": ADMIN_SECRET, "content-type": "application/json" },
    data: {}
  });
  if (res.data && res.data.success) return res.data.users || [];
  console.warn("fetchInactiveUsers failed:", res.data);
  return [];
}

exports.main = async (event, context) => {
  if (!TM_STALE) {
    console.warn("TM_STALE template id not configured, skip");
    return { success: false, reason: "模板ID未配置" };
  }

  try {
    const users = await fetchInactiveUsers();
    let sent = 0, failed = 0;

    for (const user of users) {
      if (!user.openid) continue;
      try {
        const ok = await sendSubscribeMessage(user.openid, TM_STALE, {
          thing1: { value: "看板提醒" },
          thing2: { value: "您已3天未查看看板" },
          phrase3: { value: "有新的商机等待跟进" },
          thing4: { value: "点击查看最新货源" }
        }, "pages/board/index");
        if (ok) sent++; else failed++;
      } catch (e) {
        console.error("send error:", e.message);
        failed++;
      }
    }

    return { success: true, sent, failed, total: users.length };
  } catch (err) {
    console.error("check-inactive-users error:", err);
    return { success: false, error: err.message };
  }
};
