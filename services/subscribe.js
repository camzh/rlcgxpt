/**
 * 订阅消息服务
 * 负责：1）获取用户 openid 并存储；2）请求订阅消息授权
 */
const authService = require("./auth");
const cloudApi = require("./cloud-api");

// 存储 key
const STORAGE_KEY = "subscribe_settings";

/**
 * 获取订阅消息授权状态（已授权的模板列表）
 */
function getSubscriptionSettings() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || {};
  } catch {
    return {};
  }
}

/**
 * 保存模板授权状态
 */
function saveSubscriptionSettings(settings) {
  try {
    wx.setStorageSync(STORAGE_KEY, settings);
  } catch (e) {
    console.warn("saveSubscriptionSettings failed", e);
  }
}

/**
 * 检查某模板是否已授权
 */
function isTemplateAuthorized(tmplId) {
  if (!tmplId) return false;
  const settings = getSubscriptionSettings();
  return !!settings[tmplId];
}

/**
 * 统一请求订阅消息授权
 * @param {string[]} tmplIds - 需要授权的模板 ID 数组
 * @returns {Promise<boolean>} - 是否全部授权成功
 */
function requestMessageSubscription(tmplIds = []) {
  if (!tmplIds || tmplIds.length === 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    wx.getSetting({
      withSubscriptions: true,
      success: (res) => {
        const settings = getSubscriptionSettings();
        const maintained = res.subscriptionsSetting?.mainSettings || {};
        const itemSettings = res.subscriptionsSetting?.itemSettings || {};

        // 找出尚未授权的模板
        const missing = tmplIds.filter((id) => {
          if (!id) return false;
          // 已在设置中勾选"总是保持"
          if (maintained[id]) {
            settings[id] = true;
            return false;
          }
          // 已有一次性授权记录
          if (itemSettings[id]) {
            settings[id] = itemSettings[id] === "accept";
            return false;
          }
          return true;
        });

        saveSubscriptionSettings(settings);

        if (missing.length === 0) {
          resolve(true);
          return;
        }

        // 请求授权
        wx.requestSubscribeMessage({
          tmplIds: missing,
          success: (res) => {
            missing.forEach((id) => {
              settings[id] = !!res[id];
            });
            saveSubscriptionSettings(settings);
            // 只要用户没全部拒绝就认为可以（用户可能拒绝部分）
            resolve(Object.values(res).some((v) => v === "accept" || v === "pop"));
          },
          fail: () => {
            resolve(false);
          }
        });
      },
      fail: () => {
        resolve(false);
      }
    });
  });
}

/**
 * 小程序启动/进入时，获取用户 openid 并同步到后端
 * 在 app.js 的 onLaunch 或 onShow 中调用
 */
function ensureOpenid(app) {
  return new Promise((resolve) => {
    const activeUserId = app.globalData.activeUserId;
    if (!activeUserId) {
      resolve(null);
      return;
    }

    // 先检查本地是否已有 openid
    const user = authService.getUserById(activeUserId);
    if (user && user.openid) {
      resolve(user.openid);
      return;
    }

    // 调用云函数获取 openid（code2session）
    if (wx.cloud) {
      wx.cloud.callContainer({
        config: { env: "cloudbase-d9gehmfnxf8b53557" },
        path: "/code2openid",
        method: "POST",
        data: {}
      }).then((res) => {
        const openid = res.data?.openid;
        if (openid) {
          syncOpenidToBackend(app.globalData.activeUserId, openid);
          resolve(openid);
        } else {
          resolve(null);
        }
      }).catch(() => resolve(null));
    } else {
      resolve(null);
    }
  });
}

/**
 * 同步 openid 到后端，存储到用户记录
 */
function syncOpenidToBackend(userId, openid) {
  if (!userId || !openid) return;
  cloudApi.request({
    url: `${cloudApi.getBaseUrl()}/openid`,
    method: "PUT",
    data: { userId, openid }
  }).catch((err) => {
    console.warn("syncOpenidToBackend failed", err.message);
  });
}

/**
 * 静默请求全局消息授权（首次进入小程序时调用）
 * 在 app.js 的 onLaunch -> bootstrapMiniData 之后调用
 */
function requestGlobalSubscription() {
  // 使用审批通知模板作为全局授权（核心模板）
  const globalTemplates = [
    "TM_APPROVAL",    // 审批通知
    "TM_UPDATE",      // 更新通知
    "TM_FOLLOW",      // 跟进提醒
    "TM_WEEKLY"       // 周报
  ];
  // 从本地配置读取模板 ID（用户申请后填入）
  const localConfig = getLocalTemplateIds();
  const tmplIds = globalTemplates.map((k) => localConfig[k]).filter(Boolean);

  if (tmplIds.length === 0) return;

  // 静默授权，不打断用户操作
  requestMessageSubscription(tmplIds).catch(() => {});
}

/**
 * 获取本地配置的模板 ID（需用户填入 local-config.js）
 */
function getLocalTemplateIds() {
  try {
    const localConfig = require("./local-config");
    return {
      TM_APPROVAL: localConfig.TM_APPROVAL || "",
      TM_UPDATE: localConfig.TM_UPDATE || "",
      TM_FOLLOW: localConfig.TM_FOLLOW || "",
      TM_WEEKLY: localConfig.TM_WEEKLY || "",
      TM_STALE: localConfig.TM_STALE || "",
      TM_SOLD_CONFIRM: localConfig.TM_SOLD_CONFIRM || "",
      TM_MATCH: localConfig.TM_MATCH || "",
      TM_COMPETITIVE: localConfig.TM_COMPETITIVE || "",
      TM_BATCH: localConfig.TM_BATCH || "",
      TM_ANOMALY: localConfig.TM_ANOMALY || ""
    };
  } catch {
    return {};
  }
}

/**
 * 获取当前用户的订阅消息模板 ID 列表
 */
function getUserAuthorizedTemplates() {
  const settings = getSubscriptionSettings();
  const localConfig = getLocalTemplateIds();
  return Object.entries(settings)
    .filter(([, authorized]) => authorized)
    .map(([key]) => localConfig[key])
    .filter(Boolean);
}

module.exports = {
  requestMessageSubscription,
  isTemplateAuthorized,
  ensureOpenid,
  requestGlobalSubscription,
  getLocalTemplateIds,
  getUserAuthorizedTemplates,
  syncOpenidToBackend
};
