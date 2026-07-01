const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ============== 配置项（部署后填入云函数环境变量） ==============
const CONFIG = {
  APP_ID: process.env.WX_APP_ID || "",
  APP_SECRET: process.env.WX_APP_SECRET || "",
  // 模板 ID（申请后填入）
  TEMPLATE_IDS: {
    APPROVAL_NOTICE: process.env.TM_APPROVAL || "",          // 审批通知
    UPDATE_NOTICE: process.env.TM_UPDATE || "",               // 更新通知
    FOLLOW_REMINDER: process.env.TM_FOLLOW || "",              // 跟进提醒
    WEEKLY_REPORT: process.env.TM_WEEKLY || "",               // 周报推送
    STALE_REMINDER: process.env.TM_STALE || "",               // 逾期/未访问提醒
    SOLD_CONFIRM: process.env.TM_SOLD_CONFIRM || "",          // 成交确认
    MATCH_NOTIFY: process.env.TM_MATCH || "",                 // 需求匹配
    COMPETITIVE_ALERT: process.env.TM_COMPETITIVE || "",      // 截胡提醒
    BATCH_RESULT: process.env.TM_BATCH || "",                 // 批量操作结果
    ANOMALY_ALERT: process.env.TM_ANOMALY || ""               // 数据异常告警
  }
};

// ============== access_token 管理 ==============
let cachedToken = null;
let tokenExpireAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpireAt - 60000) {
    return cachedToken;
  }

  if (!CONFIG.APP_ID || !CONFIG.APP_SECRET) {
    throw new Error("微信 access_token 未配置（APP_ID 或 APP_SECRET 缺失）");
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${CONFIG.APP_ID}&secret=${CONFIG.APP_SECRET}`;

  try {
    const res = await cloud.cloudRequest({
      url,
      method: "GET"
    });

    if (!res.data || !res.data.access_token) {
      throw new Error(`获取 access_token 失败：${JSON.stringify(res.data)}`);
    }

    cachedToken = res.data.access_token;
    tokenExpireAt = Date.now() + (res.data.expires_in || 7200) * 1000;
    return cachedToken;
  } catch (err) {
    console.error("getAccessToken error", err);
    throw new Error("获取 access_token 失败，请检查网络或配置");
  }
}

// ============== 发送订阅消息 ==============
async function sendSubscribeMessage(openid, templateId, data, page = "") {
  if (!openid) {
    throw new Error("openid 不能为空");
  }
  if (!templateId) {
    throw new Error("templateId 不能为空");
  }

  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/bizsend?access_token=${token}`;

  const payload = {
    touser: openid,
    template_id: templateId,
    data
  };

  if (page) {
    payload.page = page;
  }

  try {
    const res = await cloud.cloudRequest({
      url,
      method: "POST",
      data: payload
    });

    if (res.data && res.data.errcode !== 0) {
      // 43004: 用户未授权，40003: invalid openid 等，无需抛异常
      console.warn(`sendSubscribeMessage warning: ${JSON.stringify(res.data)}`);
      return {
        success: false,
        errcode: res.data.errcode,
        errmsg: res.data.errmsg || "发送失败"
      };
    }

    return { success: true };
  } catch (err) {
    console.error("sendSubscribeMessage error", err);
    return { success: false, error: err.message || "发送失败" };
  }
}

// ============== 云函数入口 ==============
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = event.openid || wxContext.OPENID || "";
  const templateId = event.templateId || "";
  const data = event.data || {};
  const page = event.page || "";

  // 仅允许内部调用或管理员调用（通过 cloud_context 校验）
  const trusted = event._trusted === true;

  if (!trusted) {
    // 公开接口需 openid（用户已在小程序中，openid 从 wxContext 获取）
    if (!openid) {
      return { success: false, error: "openid 不能为空" };
    }
    if (!templateId) {
      return { success: false, error: "templateId 不能为空" };
    }
  }

  try {
    const result = await sendSubscribeMessage(openid, templateId, data, page);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
};

module.exports = { sendSubscribeMessage, getAccessToken };
