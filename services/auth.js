const STORAGE_KEYS = {
  USERS: "inventory_board_users",
  SESSION: "inventory_board_session_user_id",
  LAST_REGISTER_PHONE: "inventory_board_last_register_phone",
  PASSWORDS: "inventory_board_login_passwords",
  MINI_SESSION_TOKEN: "inventory_board_mini_session_token",
  MINI_SESSION_EXPIRES_AT: "inventory_board_mini_session_expires_at",
  MINI_SESSION_PROFILE: "inventory_board_mini_session_profile"
};

const GROUP_APPROVERS = {
  "市场一组": "李动",
  "市场二组": "张瑞",
  "市场三组": "赵海"
};

const ROLE_LABELS = {
  superadmin: "超级管理员",
  admin: "管理员",
  member: "业务人员",
  staff: "业务人员"
};
const ORIGIN_URL = "https://rlcgxpt.com";
const MINI_AUTH_CHECK_URL = `${ORIGIN_URL}/api/mini/auth/check`;
const MINI_ME_URL = `${ORIGIN_URL}/api/mini/me`;

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function normalizeName(name) {
  return String(name || "").trim();
}

function normalizeUser(user) {
  const role = user.role === "member" ? "staff" : user.role || "staff";
  const group = user.group || user.department || "";
  return {
    ...user,
    group,
    department: user.department || group,
    role,
    roleLabel: user.roleLabel || ROLE_LABELS[role] || "业务人员",
    approvalStatus: user.approvalStatus || user.status || "approved"
  };
}

function ensureSeedData() {
  if (!getMiniSessionToken()) {
    wx.removeStorageSync(STORAGE_KEYS.USERS);
    wx.removeStorageSync(STORAGE_KEYS.PASSWORDS);
    return;
  }
  const profile = getMiniSessionProfile();
  if (profile && profile.id) {
    wx.setStorageSync(STORAGE_KEYS.USERS, [normalizeUser(profile)]);
  } else {
    wx.removeStorageSync(STORAGE_KEYS.USERS);
  }
  wx.removeStorageSync(STORAGE_KEYS.PASSWORDS);
}

function getUsers() {
  const current = getCurrentUser();
  return current ? [current] : [];
}

function saveUsers() {}

function getCurrentUser() {
  if (!getMiniSessionToken()) {
    return null;
  }
  const userId = wx.getStorageSync(STORAGE_KEYS.SESSION);
  const profile = getMiniSessionProfile();
  if (!userId || !profile || !profile.id || profile.id !== userId) {
    return null;
  }
  return normalizeUser(profile);
}

function getUserById(userId) {
  const current = getCurrentUser();
  return current && current.id === userId ? current : null;
}

function setMiniSession(session = {}) {
  const token = String(session.token || "");
  const expiresAt = String(session.expiresAt || "");
  const profile = session.profile && typeof session.profile === "object" ? session.profile : {};
  if (token) {
    wx.setStorageSync(STORAGE_KEYS.MINI_SESSION_TOKEN, token);
  } else {
    wx.removeStorageSync(STORAGE_KEYS.MINI_SESSION_TOKEN);
  }
  if (expiresAt) {
    wx.setStorageSync(STORAGE_KEYS.MINI_SESSION_EXPIRES_AT, expiresAt);
  } else {
    wx.removeStorageSync(STORAGE_KEYS.MINI_SESSION_EXPIRES_AT);
  }
  if (Object.keys(profile).length) {
    wx.setStorageSync(STORAGE_KEYS.MINI_SESSION_PROFILE, profile);
  } else {
    wx.removeStorageSync(STORAGE_KEYS.MINI_SESSION_PROFILE);
  }
}

function getMiniSessionToken() {
  const token = wx.getStorageSync(STORAGE_KEYS.MINI_SESSION_TOKEN) || "";
  const expiresAt = wx.getStorageSync(STORAGE_KEYS.MINI_SESSION_EXPIRES_AT) || "";
  if (!token) {
    return "";
  }
  if (expiresAt) {
    const expiresMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
      clearMiniSession();
      return "";
    }
  }
  return token;
}

function getMiniSessionProfile() {
  const profile = wx.getStorageSync(STORAGE_KEYS.MINI_SESSION_PROFILE);
  return profile && typeof profile === "object" ? profile : {};
}

function clearMiniSession() {
  wx.removeStorageSync(STORAGE_KEYS.MINI_SESSION_TOKEN);
  wx.removeStorageSync(STORAGE_KEYS.MINI_SESSION_EXPIRES_AT);
  wx.removeStorageSync(STORAGE_KEYS.MINI_SESSION_PROFILE);
}

function setCurrentUser(userOrId, session = null, profileOverride = null) {
  const profile = normalizeUser(profileOverride || (userOrId && typeof userOrId === "object" ? userOrId : {}) || {});
  if (!profile.id && typeof userOrId === "string") {
    profile.id = userOrId;
  }
  if (!profile.id) {
    throw new Error("未获取到服务器用户信息");
  }
  wx.setStorageSync(STORAGE_KEYS.SESSION, profile.id);
  if (session) {
    setMiniSession({ ...session, profile });
  } else {
    const currentSession = {
      token: getMiniSessionToken(),
      expiresAt: wx.getStorageSync(STORAGE_KEYS.MINI_SESSION_EXPIRES_AT) || "",
      profile
    };
    setMiniSession(currentSession);
  }
  wx.setStorageSync(STORAGE_KEYS.USERS, [profile]);
  return getCurrentUser();
}

function clearSession() {
  wx.removeStorageSync(STORAGE_KEYS.SESSION);
  wx.removeStorageSync(STORAGE_KEYS.USERS);
  wx.removeStorageSync(STORAGE_KEYS.PASSWORDS);
  clearMiniSession();
}

function hasLoginPassword() {
  return false;
}

function setLoginPassword() {
  throw new Error("小程序已改为短信验证码登录");
}

function verifyLoginPassword() {
  return false;
}

function setLastRegisterPhone(phone) {
  wx.setStorageSync(STORAGE_KEYS.LAST_REGISTER_PHONE, phone);
}

function getLastRegisterPhone() {
  return wx.getStorageSync(STORAGE_KEYS.LAST_REGISTER_PHONE) || "";
}

function requestServer({ url, method = "GET", data = null, token = "" }) {
  return new Promise((resolve, reject) => {
    const header = { "content-type": "application/json" };
    if (token) {
      header.Authorization = `Bearer ${token}`;
    }
    wx.request({
      url,
      method,
      data,
      header,
      timeout: 5000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {});
          return;
        }
        const error = new Error((res.data && res.data.error) || `服务器校验失败：${res.statusCode}`);
        error.statusCode = res.statusCode;
        reject(error);
      },
      fail: (error) => reject(new Error((error.errMsg && error.errMsg.includes("timeout")) ? "服务器请求超时，请稍后重试" : (error.errMsg || "服务器请求失败")))
    });
  });
}

function checkMiniUser(name, phone) {
  return requestServer({
    url: MINI_AUTH_CHECK_URL,
    method: "POST",
    data: { name: normalizeName(name), phone: normalizePhone(phone) }
  });
}

function fetchMiniProfile(session = null) {
  const token = (session && session.token) || getMiniSessionToken();
  if (!token) {
    return Promise.reject(new Error("登录会话无效，请重新获取验证码"));
  }
  return requestServer({ url: MINI_ME_URL, method: "GET", token })
    .then((res) => {
      if (!res.user) {
        throw new Error("未获取到服务器用户信息");
      }
      return normalizeUser(res.user);
    });
}

function isSuperAdmin(user) {
  return !!user && user.role === "superadmin";
}

function isAdminUser(user) {
  return !!user && (user.role === "admin" || user.role === "superadmin");
}

function approvalGroupForUser(user) {
  if (!user) {
    return "";
  }
  return Object.keys(GROUP_APPROVERS).find((group) => GROUP_APPROVERS[group] === user.name) || "";
}

module.exports = {
  ensureSeedData,
  getUsers,
  getUserById,
  getCurrentUser,
  setCurrentUser,
  setMiniSession,
  getMiniSessionToken,
  getMiniSessionProfile,
  clearMiniSession,
  clearSession,
  hasLoginPassword,
  setLoginPassword,
  verifyLoginPassword,
  setLastRegisterPhone,
  getLastRegisterPhone,
  checkMiniUser,
  fetchMiniProfile,
  isAdminUser,
  isSuperAdmin,
  approvalGroupForUser
};
