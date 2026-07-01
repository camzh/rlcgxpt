const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || "";
const BACKEND_BASE = process.env.BACKEND_BASE || "https://rlcgxpt.com";
const TM_FOLLOW = process.env.TM_FOLLOW || "";

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

async function fetchFollowReminders() {
  const url = `${BACKEND_BASE}/api/mini/subscribe/follow-reminders`;
  const res = await cloud.cloudRequest({
    url,
    method: "POST",
    header: { "x-admin-secret": ADMIN_SECRET, "content-type": "application/json" },
    data: {}
  });
  if (res.data && res.data.success) return res.data.reminders || [];
  console.warn("fetchFollowReminders failed:", res.data);
  return [];
}

exports.main = async (event, context) => {
  if (!TM_FOLLOW) {
    console.warn("TM_FOLLOW template id not configured, skip");
    return { success: false, reason: "模板ID未配置" };
  }

  try {
    const reminders = await fetchFollowReminders();
    let sent = 0, failed = 0;

    for (const r of reminders) {
      if (!r.openid) continue;
      try {
        // 发给跟进人
        if (r.followerOpenid) {
          const ok1 = await sendSubscribeMessage(r.followerOpenid, TM_FOLLOW, {
            thing1: { value: r.followerName || "跟进人" },
            thing2: { value: truncate(r.itemTitle, 20) },
            date3: { value: formatDateTime(r.lastFollowedAt) },
            thing4: { value: "已跟进超过1小时，请及时更新状态" }
          }, `pages/detail/index?id=${r.itemId}&type=${r.side}`);
          if (ok1) sent++; else failed++;
        }
        // 发给组管理员
        if (r.adminOpenid) {
          const ok2 = await sendSubscribeMessage(r.adminOpenid, TM_FOLLOW, {
            thing1: { value: r.followerName || "跟进人" },
            thing2: { value: truncate(r.itemTitle, 20) },
            date3: { value: formatDateTime(r.lastFollowedAt) },
            thing4: { value: "已跟进超过1小时，请督促更新状态" }
          }, `pages/admin-approvals/index`);
          if (ok2) sent++; else failed++;
        }
      } catch (e) {
        console.error("send error:", e.message);
        failed++;
      }
    }

    return { success: true, sent, failed, total: reminders.length };
  } catch (err) {
    console.error("check-follow-reminders error:", err);
    return { success: false, error: err.message };
  }
};

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length <= maxLen ? str : str.slice(0, maxLen) + "...";
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}
