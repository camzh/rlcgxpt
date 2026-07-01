const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 后端管理接口密钥（云函数环境变量，绝不泄漏到前端）
const ADMIN_SECRET = process.env.ADMIN_API_SECRET || "";
const BACKEND_BASE = process.env.BACKEND_BASE || "https://rlcgxpt.com";
// 微信订阅消息模板 ID（申请后填入环境变量）
const TM_STALE = process.env.TM_STALE || "";

// ============== access_token 管理 ==============
let _cachedToken = null;
let _tokenExpireAt = 0;

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpireAt - 60000) {
    return _cachedToken;
  }
  const appId = process.env.WX_APP_ID || "";
  const appSecret = process.env.WX_APP_SECRET || "";
  if (!appId || !appSecret) {
    throw new Error("微信 access_token 配置缺失");
  }
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const res = await cloud.cloudRequest({ url, method: "GET" });
  if (!res.data || !res.data.access_token) {
    throw new Error("获取 access_token 失败");
  }
  _cachedToken = res.data.access_token;
  _tokenExpireAt = Date.now() + (res.data.expires_in || 7200) * 1000;
  return _cachedToken;
}

// ============== 发送订阅消息 ==============
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

// ============== 调用后端获取数据 ==============
async function fetchStaleNotifications() {
  const url = `${BACKEND_BASE}/api/mini/subscribe/stale-check`;
  const res = await cloud.cloudRequest({
    url,
    method: "POST",
    header: {
      "x-admin-secret": ADMIN_SECRET,
      "content-type": "application/json"
    },
    data: {}
  });
  if (res.data && res.data.success) {
    return res.data.notifications || [];
  }
  console.warn("fetchStaleNotifications failed:", res.data);
  return [];
}

// ============== 云函数入口（定时触发） ==============
exports.main = async (event, context) => {
  // 仅允许云开发定时触发器调用（通过微信云平台鉴权）
  const wxContext = cloud.getWXContext();

  if (!TM_STALE) {
    console.warn("TM_STALE template id not configured, skip");
    return { success: false, reason: "模板ID未配置" };
  }

  try {
    // 从后端获取需要通知的记录
    const notifications = await fetchStaleNotifications();
    let sent = 0;
    let failed = 0;

    for (const item of notifications) {
      if (!item.openid) continue;
      try {
        const ok = await sendSubscribeMessage(item.openid, TM_STALE, {
          thing1: { value: item.typeLabel || "货源/需求" },
          thing2: { value: truncate(item.title, 20) },
          number3: { value: String(item.staleDays || 7) },
          thing4: { value: "点击查看全部逾期记录" },
          date5: { value: formatDate(item.lastUpdatedAt) }
        }, `pages/board/index?userId=${item.userId}`);
        if (ok) sent++; else failed++;
      } catch (e) {
        console.error("send error:", e.message);
        failed++;
      }
    }

    return { success: true, sent, failed, total: notifications.length };
  } catch (err) {
    console.error("check-stale-items error:", err);
    return { success: false, error: err.message };
  }
};

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length <= maxLen ? str : str.slice(0, maxLen) + "...";
}

function formatDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}
