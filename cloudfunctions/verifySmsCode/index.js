const crypto = require("crypto");
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SESSION_TTL_SECONDS = Number(process.env.MINI_SESSION_TTL_SECONDS || 7 * 24 * 60 * 60);
const MAX_VERIFY_ATTEMPTS = Number(process.env.SMS_VERIFY_MAX_ATTEMPTS || 5);
const DEFAULT_MINI_SESSION_SECRET = "";

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signMiniSession(payload) {
  const secret = process.env.MINI_SESSION_SECRET || process.env.JUZHEN_MINI_SESSION_SECRET || DEFAULT_MINI_SESSION_SECRET;
  if (!secret) {
    return null;
  }
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = base64UrlJson(payload);
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || "";
  const normalizedName = String(event.name || "").trim();
  const normalizedPhone = String(event.phone || "").trim();
  const normalizedCode = String(event.code || "").trim();

  if (!openid) {
    return { success: false, error: "微信身份校验失败，请重新进入小程序" };
  }
  if (!normalizedName) {
    return { success: false, error: "姓名不能为空" };
  }
  if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
    return { success: false, error: "手机号格式不正确" };
  }
  if (!/^\d{6}$/.test(normalizedCode)) {
    return { success: false, error: "验证码格式不正确" };
  }
  function buildSessionResult() {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = nowSeconds + SESSION_TTL_SECONDS;
    const token = signMiniSession({
      typ: "mini-session",
      sub: `${normalizedName}:${normalizedPhone}`,
      name: normalizedName,
      loginKey: `${normalizedName}:${normalizedPhone}`,
      phone: normalizedPhone,
      openid,
      iat: nowSeconds,
      exp: expiresAtSeconds
    });
    if (!token) {
      return { success: false, error: "登录会话生成失败，请联系管理员" };
    }
    return {
      success: true,
      message: "验证通过",
      session: {
        token,
        expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
        profile: { name: normalizedName, phone: normalizedPhone, openid }
      }
    };
  }

  let records;
  try {
    const res = await db.collection("sms_codes")
      .where({
        openid,
        phone: normalizedPhone,
        code: normalizedCode,
        used: false,
        expireAtMs: _.gt(Date.now())
      })
      .orderBy("createTimeMs", "desc")
      .limit(1)
      .get();
    records = res.data || [];
    if (records.length === 0) {
      const fallback = await db.collection("sms_codes")
        .where({
          phone: normalizedPhone,
          code: normalizedCode,
          used: false,
          expireAtMs: _.gt(Date.now())
        })
        .orderBy("createTimeMs", "desc")
        .limit(1)
        .get();
      records = fallback.data || [];
    }
  } catch (err) {
    console.error("query sms_codes error", err);
    return { success: false, error: "验证码校验失败，请稍后再试" };
  }

  if (records.length === 0) {
    try {
      const latest = await db.collection("sms_codes")
        .where({ phone: normalizedPhone })
        .orderBy("createTimeMs", "desc")
        .limit(1)
        .get();
      const row = latest.data && latest.data[0];
      if (!row) {
        return { success: false, error: "未找到验证码记录，请重新获取" };
      }
      if (row.used) {
        if (String(row.code || "") === normalizedCode && Number(row.expireAtMs || 0) > Date.now()) {
          return buildSessionResult();
        }
        return { success: false, error: "验证码已使用，请重新获取" };
      }
      if (Number(row.expireAtMs || 0) <= Date.now()) {
        return { success: false, error: "验证码已过期，请重新获取" };
      }
      if (String(row.code || "") !== normalizedCode) {
        const attempts = Number(row.attempts || 0) + 1;
        await db.collection("sms_codes").doc(row._id).update({
          data: {
            attempts,
            used: attempts >= MAX_VERIFY_ATTEMPTS,
            lastFailedAt: db.serverDate()
          }
        });
        return { success: false, error: "验证码不匹配，请以最近一次短信为准" };
      }
    } catch (err) {
      console.warn("record verify failure skipped", err.message);
    }
    return { success: false, error: "验证码错误或已过期" };
  }

  const record = records[0];
  if (Number(record.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
    return { success: false, error: "验证码错误次数过多，请重新获取" };
  }

  const result = buildSessionResult();
  if (!result.success) return result;

  try {
    await db.collection("sms_codes").doc(record._id).update({
      data: { used: true, usedAt: db.serverDate(), usedByOpenid: openid }
    });
  } catch (err) {
    console.error("mark sms code used error", err);
    return { success: false, error: "验证码状态更新失败，请重新获取" };
  }

  return result;
};

