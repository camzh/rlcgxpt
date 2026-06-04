const STORAGE_KEYS = {
  USERS: "inventory_board_users",
  REQUESTS: "inventory_board_registration_requests",
  SESSION: "inventory_board_session_user_id",
  LAST_REGISTER_PHONE: "inventory_board_last_register_phone"
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

const WEBSITE_USERS = [
  { name: "李动", phone: "18326671199", group: "市场一组", role: "admin" },
  { name: "张瑞", phone: "15656966696", group: "市场二组", role: "admin" },
  { name: "赵海", phone: "18788866687", group: "市场三组", role: "admin" },
  { name: "江红颖", phone: "18221553436", group: "上海区", role: "member" },
  { name: "张亚洲", phone: "13813950307", group: "管理员", role: "admin" },
  { name: "李诚", phone: "15556989488", group: "市场一组", role: "member" },
  { name: "李文化", phone: "18622631986", group: "市场二组", role: "member" },
  { name: "周易", phone: "15395083027", group: "市场三组", role: "member" },
  { name: "刘鑫", phone: "15000727568", group: "上海区", role: "member" },
  { name: "张天超", phone: "13851702995", group: "管理员", role: "superadmin" },
  { name: "张沛", phone: "13538055936", group: "市场一组", role: "member" },
  { name: "姜崇武", phone: "19315231735", group: "市场二组", role: "member" },
  { name: "汤林松", phone: "18655170511", group: "市场三组", role: "member" },
  { name: "范亮", phone: "18001697986", group: "上海区", role: "member" },
  { name: "黄昱杰", phone: "18005112660", group: "管理员", role: "admin" },
  { name: "孟梦", phone: "13752246784", group: "市场一组", role: "member" },
  { name: "骆辉华", phone: "13790589518", group: "市场二组", role: "member" },
  { name: "邹洋", phone: "18788886667", group: "市场三组", role: "member" },
  { name: "镇祝华", phone: "15301686502", group: "上海区", role: "admin" },
  { name: "周祉健", phone: "15727667383", group: "市场一组", role: "member" },
  { name: "金大圣", phone: "19259788888", group: "市场二组", role: "member" },
  { name: "赵绍华", phone: "18788866656", group: "市场三组", role: "member" },
  { name: "于海翔", phone: "15618081521", group: "上海区", role: "member" },
  { name: "赵大勇", phone: "18652057039", group: "管理员", role: "admin" },
  { name: "金凤", phone: "13692116331", group: "市场一组", role: "member" },
  { name: "王琳", phone: "17756578383", group: "市场二组", role: "member" },
  { name: "赵洋", phone: "18055568862", group: "市场三组", role: "member" },
  { name: "陆宏成", phone: "13260888103", group: "上海区", role: "member" },
  { name: "乔欢", phone: "13816674476", group: "管理员", role: "admin" },
  { name: "胡成玲", phone: "17688754134", group: "市场一组", role: "member" },
  { name: "高行荣", phone: "13956994280", group: "市场二组", role: "member" },
  { name: "任正东", phone: "15051659275", group: "市场三组", role: "member" },
  { name: "董晓东", phone: "13681544128", group: "市场一组", role: "member" },
  { name: "张杰", phone: "18654188687", group: "市场二组", role: "member" },
  { name: "王祥", phone: "18256916675", group: "市场三组", role: "member" },
  { name: "孙铮", phone: "13424154496", group: "市场一组", role: "member" },
  { name: "叶晓梅", phone: "15070711060", group: "市场二组", role: "member" },
  { name: "廖元创", phone: "18676783523", group: "市场一组", role: "member" },
  { name: "王婵", phone: "15910558576", group: "市场二组", role: "member" },
  { name: "张家晖", phone: "13928423033", group: "市场一组", role: "member" },
  { name: "金雨欣", phone: "18755422373", group: "市场二组", role: "member" },
  { name: "刘冰", phone: "13726852797", group: "市场一组", role: "member" },
  { name: "王贝贝", phone: "18639678956", group: "市场二组", role: "member" },
  { name: "李成森", phone: "15914072327", group: "市场一组", role: "member" },
  { name: "简雅楠", phone: "13243842899", group: "市场二组", role: "member" },
  { name: "Lisa", phone: "19896355556", group: "市场一组", role: "member" },
  { name: "秦小芳", phone: "15039481788", group: "市场二组", role: "member" },
  { name: "孟娇", phone: "15241533222", group: "市场一组", role: "member" },
  { name: "谢燕霞", phone: "18573517995", group: "市场二组", role: "member" },
  { name: "林勇勇", phone: "18056025603", group: "市场二组", role: "member" },
  { name: "临时普通用户", phone: "19900000001", group: "市场一组", role: "member" },
  { name: "乐乐", phone: "18926824556", group: "市场三组", role: "member" },
  { name: "临时管理员", phone: "19900000002", group: "管理员", role: "admin" }
];

const SEED_USERS = WEBSITE_USERS.map((item) => ({
  id: `seed_user_${item.phone}`,
  name: item.name,
  phone: item.phone,
  group: item.group,
  department: item.group,
  title: ROLE_LABELS[item.role] || "业务人员",
  role: item.role === "member" ? "staff" : item.role,
  roleLabel: ROLE_LABELS[item.role] || "业务人员",
  approvalStatus: "approved",
  createdAt: "2026-05-25T09:00:00+08:00"
}));

const SEED_USER_BY_IDENTITY = SEED_USERS.reduce((map, user) => {
  map[`${user.name}:${user.phone}`] = user;
  return map;
}, {});

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

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
  const storedUsers = wx.getStorageSync(STORAGE_KEYS.USERS);
  const storedRequests = wx.getStorageSync(STORAGE_KEYS.REQUESTS);
  let users = Array.isArray(storedUsers) ? storedUsers.map(normalizeUser) : [];
  let changed = !Array.isArray(storedUsers) || users.length === 0;

  SEED_USERS.forEach((seed) => {
    const index = users.findIndex((item) => item.name === seed.name && item.phone === seed.phone);
    if (index < 0) {
      users.push(seed);
      changed = true;
      return;
    }
    const merged = normalizeUser({ ...users[index], ...seed, id: users[index].id || seed.id });
    if (JSON.stringify(users[index]) !== JSON.stringify(merged)) {
      users[index] = merged;
      changed = true;
    }
  });

  const seenIds = {};
  users = users.map((user) => {
    if (!user.id || !seenIds[user.id]) {
      if (user.id) {
        seenIds[user.id] = true;
      }
      return user;
    }
    const seed = SEED_USER_BY_IDENTITY[`${user.name}:${user.phone}`];
    if (!seed || user.id === seed.id) {
      return user;
    }
    changed = true;
    seenIds[seed.id] = true;
    return { ...user, id: seed.id };
  });

  if (changed) {
    wx.setStorageSync(STORAGE_KEYS.USERS, clone(users));
  }
  if (!storedRequests || !Array.isArray(storedRequests)) {
    wx.setStorageSync(STORAGE_KEYS.REQUESTS, []);
  }
}

function getUsers() {
  ensureSeedData();
  return clone(wx.getStorageSync(STORAGE_KEYS.USERS) || []).map(normalizeUser);
}

function saveUsers(users) {
  wx.setStorageSync(STORAGE_KEYS.USERS, clone(users.map(normalizeUser)));
}

function getRequests() {
  ensureSeedData();
  return clone(wx.getStorageSync(STORAGE_KEYS.REQUESTS) || []);
}

function saveRequests(requests) {
  wx.setStorageSync(STORAGE_KEYS.REQUESTS, clone(requests));
}

function getCurrentUser() {
  ensureSeedData();
  const userId = wx.getStorageSync(STORAGE_KEYS.SESSION);
  if (!userId) {
    return null;
  }
  return getUsers().find((item) => item.id === userId) || null;
}

function getUserById(userId) {
  return getUsers().find((item) => item.id === userId) || null;
}

function setCurrentUser(userId) {
  wx.setStorageSync(STORAGE_KEYS.SESSION, userId);
  return getCurrentUser();
}

function clearSession() {
  wx.removeStorageSync(STORAGE_KEYS.SESSION);
}

function setLastRegisterPhone(phone) {
  wx.setStorageSync(STORAGE_KEYS.LAST_REGISTER_PHONE, phone);
}

function getLastRegisterPhone() {
  return wx.getStorageSync(STORAGE_KEYS.LAST_REGISTER_PHONE) || "";
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

function canApproveUser(admin, target) {
  if (!admin || !target || target.role === "superadmin") {
    return false;
  }
  if (isSuperAdmin(admin) || admin.group === "管理员") {
    return true;
  }
  const group = approvalGroupForUser(admin);
  return Boolean(group && target.group === group);
}

function findApprovedUserByIdentity(name, phone) {
  const targetName = normalizeName(name);
  const targetPhone = normalizePhone(phone);
  return getUsers().find(
    (item) =>
      item.name === targetName &&
      item.phone === targetPhone &&
      item.approvalStatus === "approved"
  ) || null;
}

function createRegistrationRequest(formData) {
  const users = getUsers();
  const requests = getRequests();
  const phone = normalizePhone(formData.phone);
  const name = normalizeName(formData.name);
  const group = formData.group || formData.department || "";
  const role = formData.role === "superadmin" ? "staff" : formData.role || "staff";
  const duplicate = users.find((item) => item.phone === phone);
  if (duplicate) {
    throw new Error("该手机号已存在，请直接登录或联系管理员确认账号状态");
  }
  const duplicateRequest = requests.find(
    (item) => item.phone === phone && item.status === "pending"
  );
  if (duplicateRequest) {
    return duplicateRequest;
  }

  const nextRequest = {
    id: `req_${Date.now()}`,
    name,
    phone,
    group,
    department: group,
    title: formData.title || ROLE_LABELS[role] || "业务人员",
    role,
    roleLabel: ROLE_LABELS[role] || "业务人员",
    remark: formData.remark || "",
    status: "pending",
    createdAt: new Date().toISOString(),
    pushStatus: "待管理员审核"
  };
  requests.push(nextRequest);
  saveRequests(requests);
  require("./notifications").addNotifications(
    users
      .filter((item) => isAdminUser(item) && item.approvalStatus === "approved")
      .map((item) => ({
        userId: item.id,
        type: "registration_request",
        title: "新员工注册待审批",
        summary: `${nextRequest.name} 提交了注册申请`,
        matchKey: `registration_${nextRequest.id}`
      }))
  );
  setLastRegisterPhone(phone);
  return nextRequest;
}

function approveRequest(requestId, adminId) {
  const requests = getRequests();
  const users = getUsers();
  const admin = getUserById(adminId);
  const requestIndex = requests.findIndex((item) => item.id === requestId);
  if (requestIndex < 0) {
    throw new Error("申请记录不存在");
  }
  const request = {
    ...requests[requestIndex],
    group: requests[requestIndex].group || requests[requestIndex].department || "",
    role: requests[requestIndex].role === "superadmin" ? "superadmin" : requests[requestIndex].role || "staff"
  };
  if (request.status !== "pending") {
    throw new Error("该申请已处理");
  }
  if (!canApproveUser(admin, request)) {
    throw new Error("只能审批自己负责分组的账号，且不能审批超级管理员");
  }
  const existingUser = users.find((item) => item.phone === request.phone);
  if (!existingUser) {
    users.push({
      id: `u_${Date.now()}`,
      name: request.name,
      phone: request.phone,
      group: request.group,
      department: request.department || request.group,
      title: request.title,
      role: request.role === "member" ? "staff" : request.role,
      roleLabel: request.roleLabel || ROLE_LABELS[request.role] || "业务人员",
      approvalStatus: "approved",
      createdAt: new Date().toISOString()
    });
  }
  requests[requestIndex] = {
    ...request,
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedBy: adminId
  };
  saveUsers(users);
  saveRequests(requests);
  return existingUser || users[users.length - 1];
}

function rejectRequest(requestId, adminId) {
  const requests = getRequests();
  const admin = getUserById(adminId);
  const requestIndex = requests.findIndex((item) => item.id === requestId);
  if (requestIndex < 0) {
    throw new Error("申请记录不存在");
  }
  const request = {
    ...requests[requestIndex],
    group: requests[requestIndex].group || requests[requestIndex].department || "",
    role: requests[requestIndex].role || "staff"
  };
  if (request.status !== "pending") {
    throw new Error("该申请已处理");
  }
  if (!canApproveUser(admin, request)) {
    throw new Error("只能审批自己负责分组的账号，且不能审批超级管理员");
  }
  requests[requestIndex] = {
    ...request,
    status: "rejected",
    approvedAt: new Date().toISOString(),
    approvedBy: adminId
  };
  saveRequests(requests);
}

function getPendingRequests(adminId) {
  const admin = adminId ? getUserById(adminId) : null;
  return getRequests()
    .map((item) => ({
      ...item,
      group: item.group || item.department || "",
      role: item.role || "staff",
      roleLabel: item.roleLabel || ROLE_LABELS[item.role || "staff"] || "业务人员"
    }))
    .filter((item) => item.status === "pending")
    .filter((item) => !admin || canApproveUser(admin, item))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function getRegistrationStatus(phone) {
  const users = getUsers();
  const requests = getRequests();
  const approvedUser = users.find((item) => item.phone === normalizePhone(phone));
  if (approvedUser) {
    return { status: approvedUser.approvalStatus || "approved", user: approvedUser };
  }
  const request = requests.find((item) => item.phone === normalizePhone(phone));
  return request ? { status: request.status, request } : { status: "none" };
}

module.exports = {
  ensureSeedData,
  getUsers,
  getUserById,
  getCurrentUser,
  setCurrentUser,
  clearSession,
  setLastRegisterPhone,
  getLastRegisterPhone,
  createRegistrationRequest,
  approveRequest,
  rejectRequest,
  getPendingRequests,
  getRegistrationStatus,
  findApprovedUserByIdentity,
  isAdminUser,
  isSuperAdmin,
  approvalGroupForUser,
  canApproveUser
};
