const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || "";
const BACKEND_BASE = process.env.BACKEND_BASE || "https://rlcgxpt.com";
const TM_WEEKLY = process.env.TM_WEEKLY || "";

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

async function fetchWeeklyReports() {
  const url = `${BACKEND_BASE}/api/mini/subscribe/weekly-reports`;
  const res = await cloud.cloudRequest({
    url,
    method: "POST",
    header: { "x-admin-secret": ADMIN_SECRET, "content-type": "application/json" },
    data: {}
  });
  if (res.data && res.data.success) return res.data.reports || [];
  console.warn("fetchWeeklyReports failed:", res.data);
  return [];
}

exports.main = async (event, context) => {
  if (!TM_WEEKLY) {
    console.warn("TM_WEEKLY template id not configured, skip");
    return { success: false, reason: "模板ID未配置" };
  }

  try {
    const reports = await fetchWeeklyReports();
    let sent = 0, failed = 0;

    for (const r of reports) {
      if (!r.openid) continue;
      try {
        let data;
        if (r.role === "staff") {
          data = {
            thing1: { value: r.userName || "用户" },
            date2: { value: r.period || "" },
            thing3: { value: `发布${r.publish || 0} | 成交${r.sold || 0} | 跟进${r.following || 0}` },
            thing4: { value: r.rateChange >= 0 ? `成交率↑${r.rateChange}%` : `成交率↓${Math.abs(r.rateChange)}%` }
          };
        } else {
          data = {
            thing1: { value: r.userName || "管理员" },
            date2: { value: r.period || "" },
            thing3: { value: `团队发布${r.teamPublish || 0} | 团队成交${r.teamSold || 0} | 待审${r.pendingCount || 0}` },
            thing4: { value: `新增注册${r.newUsers || 0}人` }
          };
        }
        const ok = await sendSubscribeMessage(r.openid, TM_WEEKLY, data, "pages/board/index");
        if (ok) sent++; else failed++;
      } catch (e) {
        console.error("send error:", e.message);
        failed++;
      }
    }

    return { success: true, sent, failed, total: reports.length };
  } catch (err) {
    console.error("generate-weekly-reports error:", err);
    return { success: false, error: err.message };
  }
};
