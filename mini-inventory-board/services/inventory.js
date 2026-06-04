const { USERS, INVENTORY, LOGS } = require("../mock/data");
const authService = require("./auth");
const cloudApi = require("./cloud-api");
const notificationService = require("./notifications");
const {
  INVENTORY_STATUS,
  LOG_ACTIONS,
  REVIEW_STATUS,
  SOURCE_TYPES,
  BUSINESS_TYPES,
  BUSINESS_TYPE_OPTIONS,
  RENTAL_PRICE_OPTIONS,
  PRICE_UNITS,
  buildDefaultRentalPrices,
  normalizePriceUnit,
  getPriceUnitLabel,
  DEFAULT_ENUM_OPTIONS
} = require("../utils/constants");
const { clone, formatDateTime, getStatusView, pickVisibleFields } = require("../utils/helpers");

const SPEC_LABELS = {
  brand: "品牌",
  model: "型号",
  capacity: "容量",
  frequency: "频率",
  memoryType: "类型",
  rank: "规格",
  interfaceType: "接口",
  formFactor: "形态/接口",
  grade: "等级/用途",
  memory: "内存/显存",
  power: "功耗",
  cpu: "CPU",
  cpuCount: "CPU数量",
  memoryBrand: "内存品牌",
  diskCount: "硬盘数量",
  diskBrand: "硬盘品牌",
  diskCapacity: "硬盘容量",
  powerSupply: "电源",
  storage: "硬盘",
  m2: "M.2",
  gpu: "GPU",
  nic: "网卡"
};

function normalizeBusinessType(value) {
  return [BUSINESS_TYPES.SALE, BUSINESS_TYPES.RENT, BUSINESS_TYPES.BOTH].includes(value) ? value : BUSINESS_TYPES.SALE;
}

function isRentableType(value) {
  const businessType = normalizeBusinessType(value);
  return businessType === BUSINESS_TYPES.RENT || businessType === BUSINESS_TYPES.BOTH;
}

function isBuyableType(value) {
  const businessType = normalizeBusinessType(value);
  return businessType === BUSINESS_TYPES.SALE || businessType === BUSINESS_TYPES.BOTH;
}

function normalizeRentalPrices(value) {
  const defaults = buildDefaultRentalPrices();
  return RENTAL_PRICE_OPTIONS.reduce((result, item) => {
    const raw = value && value[item.key] !== undefined ? value[item.key] : defaults[item.key];
    result[item.key] = String(raw || "");
    return result;
  }, {});
}

function getBusinessTypeText(value) {
  const businessType = normalizeBusinessType(value);
  const found = BUSINESS_TYPE_OPTIONS.find((item) => item.value === businessType);
  return found ? found.label : "出售";
}

function buildRentalPriceText(prices) {
  const normalized = normalizeRentalPrices(prices);
  return RENTAL_PRICE_OPTIONS
    .map((item) => {
      const price = normalized[item.key];
      return price ? `${item.label}: ${price}万/月/台` : "";
    })
    .filter(Boolean)
    .join(" ｜ ");
}
function buildSpecDetails(item) {
  const existing = item.specDetails && typeof item.specDetails === "object" ? item.specDetails : {};
  return {
    ...existing,
    brand: existing.brand || item.brand || "",
    model: existing.model || item.model || "",
    cpu: existing.cpu || item.cpu || "",
    memory: existing.memory || item.memory || "",
    storage: existing.storage || item.storage || "",
    m2: existing.m2 || item.m2 || "",
    gpu: existing.gpu || item.gpu || "",
    nic: existing.nic || item.nic || "",
    diskCapacity: existing.diskCapacity || item.storage || ""
  };
}

function buildSpecPairs(specDetails) {
  return Object.keys(specDetails || {})
    .filter((key) => String(specDetails[key] || "").trim() !== "")
    .map((key) => ({ key, label: SPEC_LABELS[key] || key, value: specDetails[key] }));
}
const STORAGE_KEYS = {
  INVENTORY: "inventory_board_items",
  LOGS: "inventory_board_logs"
};

function getUsers() {
  const authUsers = authService
    .getUsers()
    .filter((item) => item.approvalStatus === "approved")
    .map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      roleLabel: item.roleLabel,
      department: item.department || "",
      title: item.title || ""
    }));
  const merged = [...authUsers];
  USERS.forEach((seedUser) => {
    if (!merged.find((item) => item.id === seedUser.id)) {
      merged.push(seedUser);
    }
  });
  return clone(merged);
}

function ensureSeedData() {
  const items = wx.getStorageSync(STORAGE_KEYS.INVENTORY);
  const logs = wx.getStorageSync(STORAGE_KEYS.LOGS);
  if (!items || !Array.isArray(items)) {
    wx.setStorageSync(STORAGE_KEYS.INVENTORY, []);
  } else {
    const remoteItems = items.filter((item) => item.remoteSynced);
    if (remoteItems.length !== items.length) {
      saveItems(remoteItems);
    }
  }
  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    wx.setStorageSync(STORAGE_KEYS.LOGS, clone(LOGS));
  }
}

function getItems() {
  ensureSeedData();
  return clone(wx.getStorageSync(STORAGE_KEYS.INVENTORY) || []);
}

function isRemoteUrl(value = "") {
  return /^https?:\/\//i.test(String(value || ""));
}

function compactItemForStorage(item) {
  return {
    ...item,
    image: isRemoteUrl(item.image) ? item.image : '',
    video: isRemoteUrl(item.video) ? item.video : '',
    imageUrls: Array.isArray(item.imageUrls) ? item.imageUrls.filter(isRemoteUrl).slice(0, 6) : [],
    mediaFiles: Array.isArray(item.mediaFiles)
      ? item.mediaFiles
        .map((file) => {
          if (typeof file === "string") {
            return isRemoteUrl(file) ? file : "";
          }
          const url = file && (file.url || file.tempFilePath);
          return url && isRemoteUrl(url) ? { ...file, url, tempFilePath: "" } : null;
        })
        .filter(Boolean)
        .slice(0, 6)
      : []
  };
}

function setStorageSafely(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (error) {
    wx.removeStorageSync(key);
    wx.setStorageSync(key, value);
  }
}

function minimalItemForStorage(item) {
  return {
    id: item.id,
    remoteSynced: !!item.remoteSynced,
    title: item.title || "",
    displayTitle: item.displayTitle || item.title || "",
    category: item.category || "",
    condition: item.condition || "",
    stockStatus: item.stockStatus || "",
    leadTimeDays: item.leadTimeDays || 0,
    businessType: item.businessType || BUSINESS_TYPES.SALE,
    rentalPrices: normalizeRentalPrices(item.rentalPrices),
    brand: item.brand || "",
    model: item.model || "",
    specDetails: item.specDetails || {},
    ownerInfo: item.ownerInfo || "",
    sourceType: item.sourceType || SOURCE_TYPES.OWN,
    quantity: item.quantity || 0,
    price: item.price || "",
    priceUnit: normalizePriceUnit(item.priceUnit),
    location: item.location || "",
    arrivalDate: item.arrivalDate || "",
    deliveryDate: item.deliveryDate || "",
    cpu: item.cpu || "",
    memory: item.memory || "",
    storage: item.storage || "",
    m2: item.m2 || "",
    gpu: item.gpu || "",
    nic: item.nic || "",
    contactName: item.contactName || "",
    contactMethod: item.contactMethod || "",
    isUrgent: !!item.isUrgent,
    remark: item.remark || "",
    status: item.status || INVENTORY_STATUS.ON_SALE,
    followOwnerId: item.followOwnerId || "",
    followOwnerName: item.followOwnerName || "",
    lastFollowedAt: item.lastFollowedAt || "",
    followReminderSent: !!item.followReminderSent,
    followCancelPending: !!item.followCancelPending,
    reviewStatus: item.reviewStatus || REVIEW_STATUS.AUTO,
    reviewReason: item.reviewReason || "",
    reviewGroup: item.reviewGroup || "",
    offlineReviewStatus: item.offlineReviewStatus || "",
    offlineReason: item.offlineReason || "",
    offlineRequestedAt: item.offlineRequestedAt || "",
    offlineRequestedBy: item.offlineRequestedBy || "",
    offlineRequestedByName: item.offlineRequestedByName || "",
    offlineReviewedAt: item.offlineReviewedAt || "",
    offlineReviewedBy: item.offlineReviewedBy || "",
    offlineReviewedByName: item.offlineReviewedByName || "",
    completionReviewStatus: item.completionReviewStatus || "",
    completionReason: item.completionReason || "",
    completionRequestedAt: item.completionRequestedAt || "",
    completionRequestedBy: item.completionRequestedBy || "",
    completionRequestedByName: item.completionRequestedByName || "",
    completionReviewedAt: item.completionReviewedAt || "",
    completionReviewedBy: item.completionReviewedBy || "",
    completionReviewedByName: item.completionReviewedByName || "",
    sellerId: item.sellerId || "",
    sellerName: item.sellerName || "",
    soldAt: item.soldAt || "",
    creatorId: item.creatorId || "",
    creatorName: item.creatorName || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    isDeleted: !!item.isDeleted,
    remoteDeleted: !!item.remoteDeleted,
    imageUrls: [],
    mediaFiles: []
  };
}

function saveItems(items) {
  const compacted = items.map(compactItemForStorage);
  try {
    setStorageSafely(STORAGE_KEYS.INVENTORY, clone(compacted));
  } catch (error) {
    setStorageSafely(STORAGE_KEYS.INVENTORY, clone(compacted.map(minimalItemForStorage)));
  }
}

function isFinalReviewStatus(status) {
  return status === REVIEW_STATUS.APPROVED || status === REVIEW_STATUS.REJECTED;
}

function preserveFinalReviewState(remote, existing) {
  const keepOffline = isFinalReviewStatus(existing.offlineReviewStatus) && existing.offlineReviewedAt
    && remote.offlineReviewStatus !== existing.offlineReviewStatus;
  const keepCompletion = isFinalReviewStatus(existing.completionReviewStatus) && existing.completionReviewedAt
    && remote.completionReviewStatus !== existing.completionReviewStatus;
  const next = { ...remote };
  if (keepOffline) {
    next.status = existing.offlineReviewStatus === REVIEW_STATUS.APPROVED ? INVENTORY_STATUS.OFFLINE : existing.status;
    next.offlineReviewStatus = existing.offlineReviewStatus;
    next.offlineReason = existing.offlineReason || remote.offlineReason || "";
    next.offlineRequestedAt = existing.offlineRequestedAt || remote.offlineRequestedAt || "";
    next.offlineRequestedBy = existing.offlineRequestedBy || remote.offlineRequestedBy || "";
    next.offlineRequestedByName = existing.offlineRequestedByName || remote.offlineRequestedByName || "";
    next.offlineReviewedAt = existing.offlineReviewedAt;
    next.offlineReviewedBy = existing.offlineReviewedBy || "";
    next.offlineReviewedByName = existing.offlineReviewedByName || "";
  }
  if (keepCompletion) {
    next.status = existing.completionReviewStatus === REVIEW_STATUS.APPROVED ? INVENTORY_STATUS.SOLD : next.status || existing.status;
    next.completionReviewStatus = existing.completionReviewStatus;
    next.completionReason = existing.completionReason || remote.completionReason || "";
    next.completionRequestedAt = existing.completionRequestedAt || remote.completionRequestedAt || "";
    next.completionRequestedBy = existing.completionRequestedBy || remote.completionRequestedBy || "";
    next.completionRequestedByName = existing.completionRequestedByName || remote.completionRequestedByName || "";
    next.completionReviewedAt = existing.completionReviewedAt;
    next.completionReviewedBy = existing.completionReviewedBy || "";
    next.completionReviewedByName = existing.completionReviewedByName || "";
    next.soldAt = existing.soldAt || remote.soldAt || "";
    next.sellerId = existing.sellerId || remote.sellerId || "";
    next.sellerName = existing.sellerName || remote.sellerName || "";
  }
  return next;
}

function mergeRemoteItems(remoteItems) {
  const localItems = getItems();
  const remoteIds = remoteItems.map((item) => item.id);
  const mergedRemote = remoteItems.map((remote) => {
    const existing = localItems.find((item) => item.id === remote.id);
    if (!existing) {
      return remote;
    }
    const remoteStatus = remote.status || (remote.remoteDeleted ? INVENTORY_STATUS.OFFLINE : "");
    const completionApprovedByRemote = existing.completionReviewStatus === REVIEW_STATUS.PENDING
      && remoteStatus === INVENTORY_STATUS.SOLD;
    const offlineApprovedByRemote = existing.offlineReviewStatus === REVIEW_STATUS.PENDING
      && remoteStatus === INVENTORY_STATUS.OFFLINE;
    const localCancelFollowPending = !!existing.followCancelPending
      && existing.status === INVENTORY_STATUS.ON_SALE
      && remoteStatus === INVENTORY_STATUS.FOLLOWING;
    return preserveFinalReviewState({
      ...remote,
      creatorId: existing.creatorId || remote.creatorId,
      creatorName: existing.creatorName || remote.creatorName,
      contactName: existing.contactName || remote.contactName,
      contactMethod: existing.contactMethod || remote.contactMethod,
      status: localCancelFollowPending
        ? existing.status
        : (completionApprovedByRemote
        ? INVENTORY_STATUS.SOLD
        : (offlineApprovedByRemote ? INVENTORY_STATUS.OFFLINE : remoteStatus || existing.status)),
      followOwnerId: localCancelFollowPending ? "" : (remote.followOwnerId || existing.followOwnerId || ""),
      followOwnerName: localCancelFollowPending ? "" : (remote.followOwnerName || existing.followOwnerName || ""),
      lastFollowedAt: localCancelFollowPending ? "" : (remote.lastFollowedAt || existing.lastFollowedAt || ""),
      followReminderSent: localCancelFollowPending ? false : (remote.followReminderSent || existing.followReminderSent || false),
      followCancelPending: localCancelFollowPending,
      sellerId: completionApprovedByRemote ? (existing.completionRequestedBy || existing.creatorId || "") : (existing.sellerId || ""),
      sellerName: completionApprovedByRemote ? (existing.completionRequestedByName || existing.creatorName || "") : (existing.sellerName || ""),
      soldAt: completionApprovedByRemote ? (existing.soldAt || remote.deletedAt || remote.updatedAt || new Date().toISOString()) : (existing.soldAt || remote.soldAt || ""),
      reviewStatus: existing.reviewStatus || remote.reviewStatus,
      offlineReviewStatus: offlineApprovedByRemote ? REVIEW_STATUS.APPROVED : (remote.offlineReviewStatus || existing.offlineReviewStatus),
      offlineReason: existing.offlineReason || remote.offlineReason || "",
      offlineRequestedAt: existing.offlineRequestedAt,
      offlineRequestedBy: existing.offlineRequestedBy,
      offlineRequestedByName: existing.offlineRequestedByName,
      completionReviewStatus: completionApprovedByRemote ? REVIEW_STATUS.APPROVED : (remote.completionReviewStatus || existing.completionReviewStatus),
      completionReason: existing.completionReason || remote.completionReason || "",
      completionRequestedAt: existing.completionRequestedAt,
      completionRequestedBy: existing.completionRequestedBy,
      completionRequestedByName: existing.completionRequestedByName,
      completionReviewedAt: completionApprovedByRemote ? (existing.completionReviewedAt || remote.completionReviewedAt || remote.updatedAt || new Date().toISOString()) : (remote.completionReviewedAt || existing.completionReviewedAt),
      offlineReviewedAt: offlineApprovedByRemote ? (existing.offlineReviewedAt || remote.offlineReviewedAt || remote.updatedAt || new Date().toISOString()) : (remote.offlineReviewedAt || existing.offlineReviewedAt)
    }, existing);
  });
  const retainedLocal = localItems.filter((item) => {
    if (remoteIds.includes(item.id) || item.isDeleted) {
      return false;
    }
    return item.status === INVENTORY_STATUS.OFFLINE
      || item.status === INVENTORY_STATUS.SOLD
      || item.offlineReviewStatus === REVIEW_STATUS.PENDING
      || item.completionReviewStatus === REVIEW_STATUS.PENDING;
  });
  saveItems([...mergedRemote, ...retainedLocal]);
}

function buildSyncFailure(actionText, error) {
  const detail = error && error.message ? error.message : "请稍后重试";
  return new Error(`${actionText}已保存到本地，但同步失败：${detail}`);
}

function refreshCloudItems() {
  return cloudApi.fetchItems("supply").then((remoteItems) => {
    mergeRemoteItems(remoteItems);
    return remoteItems;
  });
}

function clearLocalOnlyItems() {
  const items = wx.getStorageSync(STORAGE_KEYS.INVENTORY);
  if (Array.isArray(items)) {
    saveItems(items.filter((item) => item.remoteSynced));
  }
}

function getBootstrapItems() {
  return getItems()
    .map(normalizeLegacyItem)
    .filter((item) => !item.isDeleted);
}

function getLogs() {
  ensureSeedData();
  return clone(wx.getStorageSync(STORAGE_KEYS.LOGS) || []);
}

function saveLogs(logs) {
  wx.setStorageSync(STORAGE_KEYS.LOGS, clone(logs));
}

function getUserById(userId) {
  return getUsers().find((user) => user.id === userId);
}

function getCreatorUserForItem(item = {}) {
  const users = getUsers();
  return users.find((user) => user.id === item.creatorId)
    || users.find((user) => item.contactMethod && user.phone === item.contactMethod)
    || users.find((user) => item.creatorName && user.name === item.creatorName)
    || users.find((user) => item.contactName && user.name === item.contactName)
    || null;
}

function getReviewGroupForItem(item = {}) {
  if (item.reviewGroup) {
    return item.reviewGroup;
  }
  const creator = getCreatorUserForItem(item);
  return creator ? (creator.group || creator.department || "") : "";
}

function canEditItem(item, activeUserId) {
  const user = getUserById(activeUserId);
  return !!user && (authService.isAdminUser(user) || item.creatorId === activeUserId);
}

function getOwnedLabel(item, currentUser) {
  if (!currentUser) {
    return item.creatorName || "未知";
  }
  if (item.creatorId === currentUser.id) {
    return authService.isAdminUser(currentUser) ? "公司货源" : "我发布";
  }
  return item.sourceType === SOURCE_TYPES.COMPANY ? "公司货源" : item.creatorName || "未知";
}

function getOptionLabel(options, value, fallback) {
  const found = options.find((opt) => opt.value === value);
  return found ? found.label : fallback;
}

function normalizeLegacyItem(item) {
  const specDetails = buildSpecDetails(item);
  const stockStatus = item.stockStatus || (item.arrivalDate === "现货" ? "现货" : "准现货");
  const leadTimeDays = Math.max(Number(item.leadTimeDays) || 0, 0);
  return {
    businessType: normalizeBusinessType(item.businessType),
    rentalPrices: normalizeRentalPrices(item.rentalPrices),
    priceUnit: normalizePriceUnit(item.priceUnit),
    category: item.category || "整机服务器",
    condition: item.condition || "",
    stockStatus,
    leadTimeDays,
    contactName: item.contactName || item.followOwnerName || item.creatorName || "",
    contactMethod: item.contactMethod || item.contactPhone || "",
    customerTag: item.customerTag || "老客户",
    imageUrls: Array.isArray(item.imageUrls) ? item.imageUrls : (item.image ? [item.image] : []),
    mediaFiles: Array.isArray(item.mediaFiles) ? item.mediaFiles : [
      item.image ? { type: "image", url: item.image } : null,
      item.video ? { type: "video", url: item.video } : null
    ].filter(Boolean),
    isUrgent: !!item.isUrgent,
    ...item,
    displayTitle: item.displayTitle || item.title,
    arrivalDate: item.arrivalDate || (leadTimeDays > 0 ? `${leadTimeDays}天` : (stockStatus === "现货" ? "现货" : "0天")),
    deliveryDate: item.deliveryDate || item.arrivalDate || (leadTimeDays > 0 ? `${leadTimeDays}天` : (stockStatus === "现货" ? "现货" : "0天"))
  };
}

function computeCompleteness(formData) {
  const requiredFields = [
    "title",
    "category",
    "condition",
    "stockStatus",
    "brand",
    "model",
    "configSummary",
    "quantity",
    "price",
    "location",
    "contactName",
    "contactMethod"
  ];
  const filled = requiredFields.filter((key) => {
    const value = formData[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  }).length;
  return filled / requiredFields.length;
}

function calcAveragePrice(items) {
  const numbers = items
    .map((item) => Number(item.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!numbers.length) {
    return 0;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function evaluateReview(formData, items, ignoreId = "") {
  const completeness = computeCompleteness(formData);
  const peerItems = items.filter((item) => {
    if (ignoreId && item.id === ignoreId) {
      return false;
    }
    if (formData.brand && item.brand !== formData.brand) {
      return false;
    }
    if (formData.model && item.model !== formData.model) {
      return false;
    }
    return item.price;
  });
  const avgPrice = calcAveragePrice(peerItems);
  const currentPrice = Number(formData.price) || 0;
  const priceGapRate = avgPrice > 0 && currentPrice > 0 ? Math.abs(currentPrice - avgPrice) / avgPrice : 0;
  const requiresReview = completeness < 0.85 || priceGapRate > 0.25;
  return {
    completeness,
    avgPrice,
    priceGapRate,
    reviewStatus: requiresReview ? REVIEW_STATUS.PENDING : REVIEW_STATUS.AUTO,
    reviewReason: requiresReview ? "信息完整度或价格偏差触发人工审核" : "自动通过"
  };
}


function getPriceNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : Number.MAX_SAFE_INTEGER;
}

function formatSalePrice(value, unit) {
  return String(value || "").trim() ? `${value} ${getPriceUnitLabel(unit)}` : "面议";
}

function normalizeCardText(value) {
  return String(value || "")
    .replace(/未标注|未标记|未设置/g, "")
    .replace(/[·｜|/\\,，;；]\s*([·｜|/\\,，;；])/g, "$1")
    .replace(/^\s*[·｜|/\\,，;；]+\s*|\s*[·｜|/\\,，;；]+\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isMeaningfulCardValue(value) {
  const text = normalizeCardText(value);
  if (!text) {
    return false;
  }
  return !["未标注", "未标记", "未设置", "未知", "无", "N/A", "n/a", "null", "undefined"].includes(text);
}

function normalizeCompareText(value) {
  return normalizeCardText(value).toLowerCase().replace(/[\s·｜|/\\:：,，;；()（）\-_/]/g, "");
}

function cardTextContains(base, value) {
  const baseText = normalizeCompareText(base);
  const valueText = normalizeCompareText(value);
  if (!baseText || !valueText) {
    return false;
  }
  if (baseText.includes(valueText) || valueText.includes(baseText)) {
    return true;
  }
  const tokens = normalizeCardText(value)
    .split(/[\s·｜|/\\:：,，;；()（）\-_/]+/)
    .map(normalizeCompareText)
    .filter((token) => token.length >= 2);
  return tokens.length > 0 && tokens.every((token) => baseText.includes(token));
}

function compactCardParts(parts, titleText = "") {
  const seen = [];
  return parts
    .map((part) => ({
      label: part.label || "",
      value: normalizeCardText(part.value !== undefined ? part.value : part)
    }))
    .filter((part) => isMeaningfulCardValue(part.value))
    .filter((part) => !cardTextContains(titleText, part.value))
    .filter((part) => {
      const key = normalizeCompareText(part.value);
      if (!key || seen.some((item) => item.includes(key) || key.includes(item))) {
        return false;
      }
      seen.push(key);
      return true;
    })
    .map((part) => part.label ? `${part.label}:${part.value}` : part.value);
}

function buildSupplyCardTitle(item) {
  const titleParts = compactCardParts([
    item.model,
    item.condition,
    item.stockStatus
  ]);
  if (titleParts.length) {
    return titleParts.join(" · ");
  }
  const explicitTitle = normalizeCardText(item.displayTitle || item.title);
  return isMeaningfulCardValue(explicitTitle) ? explicitTitle : "未命名货源";
}

function buildSupplyCardSubtitle(item) {
  const titleText = buildSupplyCardTitle(item);
  const specParts = buildSpecPairs(item.specDetails)
    .filter((entry) => !["brand", "model"].includes(entry.key))
    .map((entry) => ({ label: entry.label, value: entry.value }));
  const compactSpecs = compactCardParts(specParts, titleText);
  if (compactSpecs.length) {
    return compactSpecs.slice(0, 5).join(" / ");
  }
  return compactCardParts([
    { label: "品类", value: item.category },
    { label: "成色", value: item.condition },
    { label: "CPU", value: item.cpu },
    { label: "内存", value: item.memory },
    { label: "硬盘", value: item.storage },
    { label: "GPU", value: item.gpu },
    { label: "网卡", value: item.nic }
  ], titleText).slice(0, 5).join(" / ");
}

function buildCreatorContact(item) {
  const creator = getUserById(item.creatorId);
  const name = item.creatorName || (creator && creator.name) || "";
  const phone = (creator && creator.phone) || "";
  return [name, phone].filter(Boolean).join(" ");
}

function isItemReviewPending(item = {}) {
  if (item.status === INVENTORY_STATUS.SOLD || item.status === INVENTORY_STATUS.OFFLINE) {
    return false;
  }
  return item.offlineReviewStatus === REVIEW_STATUS.PENDING || item.completionReviewStatus === REVIEW_STATUS.PENDING;
}

function decorateItem(rawItem, currentUserId = "") {
  const item = normalizeLegacyItem(rawItem);
  const currentUser = currentUserId ? getUserById(currentUserId) : null;
  const ownerInfoVisible = canViewOwnerInfo(currentUser, item);
  const sourceTypeText = getOptionLabel(DEFAULT_ENUM_OPTIONS.sourceType, item.sourceType, item.sourceType || "未设置");
  const marketTypeText = getOptionLabel(DEFAULT_ENUM_OPTIONS.marketType, item.marketType, item.marketType || "未设置");
  const reviewStatusText = item.reviewStatus === REVIEW_STATUS.PENDING
    ? "待审核"
    : item.reviewStatus === REVIEW_STATUS.APPROVED
      ? "已审核"
      : "自动通过";
  const statusMeta = isItemReviewPending(item)
    ? { text: "审批中", className: "status-following" }
    : getStatusView(item.status);
  const cardStatusText = isItemReviewPending(item)
    ? "审批中"
    : (isRentableType(item.businessType) ? getBusinessTypeText(item.businessType) : statusMeta.text);
  const cardStatusClass = isItemReviewPending(item)
    ? "status-following"
    : (isRentableType(item.businessType) ? "status-rent" : statusMeta.className);
  return {
    ...item,
    ownerInfo: ownerInfoVisible ? item.ownerInfo || "" : "",
    canViewOwnerInfo: ownerInfoVisible,
    canEdit: canEditItem(item, currentUserId),
    ownerLabel: getOwnedLabel(item, currentUser),
    statusMeta,
    sourceTypeText,
    marketTypeText,
    reviewStatusText,
    businessTypeText: getBusinessTypeText(item.businessType),
    isRentable: isRentableType(item.businessType),
    isBuyable: isBuyableType(item.businessType),
    rentalPriceText: buildRentalPriceText(item.rentalPrices),
    rentalLineText: isRentableType(item.businessType) ? buildRentalPriceText(item.rentalPrices) : "",
    cardStatusText,
    cardStatusClass,
    
    specPairs: buildSpecPairs(item.specDetails),
    cardTitle: buildSupplyCardTitle(item),
    cardSubtitle: buildSupplyCardSubtitle(item),
    creatorContactText: buildCreatorContact(item),
    priceSortValue: getPriceNumber(item.price),
    priceLabel: formatSalePrice(item.price, item.priceUnit),
    leadTimeText: Number(item.leadTimeDays) > 0 ? `${Number(item.leadTimeDays)}天` : (item.stockStatus === "现货" ? "现货" : "0天"),
    updatedAtText: formatDateTime(item.updatedAt),
    soldAtText: item.soldAt ? formatDateTime(item.soldAt) : "",
    completionText: `${Math.round((item.completeness || 0) * 100)}%`
  };
}

function buildStats(items) {
  const today = formatDateTime(new Date()).slice(0, 10);
  return items.reduce(
    (stats, item) => {
      if (item.isDeleted) {
        return stats;
      }
      if (item.status === INVENTORY_STATUS.ON_SALE) {
        stats.onSale += 1;
      }
      if (item.status === INVENTORY_STATUS.FOLLOWING) {
        stats.following += 1;
      }
      if (item.status === INVENTORY_STATUS.SOLD) {
        stats.sold += 1;
      }
      if (item.reviewStatus === REVIEW_STATUS.PENDING) {
        stats.pendingReview += 1;
      }
      if (item.createdAt && item.createdAt.slice(0, 10) === today) {
        stats.todayAdded += 1;
      }
      if (item.soldAt && item.soldAt.slice(0, 10) === today) {
        stats.todaySold += 1;
      }
      return stats;
    },
    { onSale: 0, following: 0, sold: 0, pendingReview: 0, todayAdded: 0, todaySold: 0 }
  );
}

function filterItems({ keyword = "", status = "all", creatorId = "", currentUserId = "", urgentOnly = false, reviewPendingOnly = false, businessFilter = "all", sourceFilter = "all", includeInactive = false } = {}) {
  const normalized = keyword.trim().toLowerCase();
  const currentUser = currentUserId ? getUserById(currentUserId) : null;
  return getItems()
    .map(normalizeLegacyItem)
    .filter((item) => !item.isDeleted)
    .filter((item) => {
      if (currentUser && !authService.isAdminUser(currentUser) && item.reviewStatus === REVIEW_STATUS.PENDING && item.creatorId !== currentUser.id) {
        return false;
      }
      if (reviewPendingOnly && !isItemReviewPending(item)) {
        return false;
      }
      if (!includeInactive && !reviewPendingOnly && (item.status === INVENTORY_STATUS.OFFLINE || item.status === INVENTORY_STATUS.SOLD)) {
        return false;
      }
      if (status !== "all" && item.status !== status) {
        return false;
      }
      if (sourceFilter === "mine" && item.creatorId !== currentUserId) {
        return false;
      }
      if (sourceFilter === "company" && item.sourceType !== SOURCE_TYPES.COMPANY) {
        return false;
      }
      if (sourceFilter === "others" && (item.creatorId === currentUserId || item.sourceType === SOURCE_TYPES.COMPANY)) {
        return false;
      }      if (creatorId && item.creatorId !== creatorId) {
        return false;
      }
      if (businessFilter === "rentable" && !isRentableType(item.businessType)) {
        return false;
      }
      if (businessFilter === "buying" && !isBuyableType(item.businessType)) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const source = [
        item.title,
        item.category,
        item.condition,
        item.stockStatus,
        item.brand,
        item.model,
        item.location,
        item.configSummary,
        item.cpu,
        item.memory,
        item.storage,
        item.gpu,
        item.nic,
        item.contactName,
        item.contactMethod,
        item.customerTag
      ]
        .join(" ")
        .toLowerCase();
      return source.includes(normalized);
    })
    .sort((a, b) => {
      if ((a.status === INVENTORY_STATUS.OFFLINE) !== (b.status === INVENTORY_STATUS.OFFLINE)) {
        return a.status === INVENTORY_STATUS.OFFLINE ? 1 : -1;
      }
      if (!!a.isUrgent !== !!b.isUrgent) {
        return a.isUrgent ? -1 : 1;
      }
      const priceDiff = getPriceNumber(a.price) - getPriceNumber(b.price);
      if (priceDiff !== 0) {
        return priceDiff;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .map((item) => decorateItem(item, currentUserId));
}

function getItemById(id, currentUserId = "") {
  const item = getItems().find((entry) => entry.id === id && !entry.isDeleted);
  return item ? decorateItem(item, currentUserId) : null;
}

function decorateLog(log) {
  const actionMap = {
    [LOG_ACTIONS.CREATE]: "新增货源",
    [LOG_ACTIONS.UPDATE]: "更新货源",
    [LOG_ACTIONS.MARK_FOLLOWING]: "标记跟进中",
    [LOG_ACTIONS.MARK_SOLD]: "标记已完成",
    [LOG_ACTIONS.MARK_OFFLINE]: "下架货源",
    [LOG_ACTIONS.DELETE]: "删除货源",
    [LOG_ACTIONS.RESTORE]: "恢复货源"
  };
  const item = getItems().find((entry) => entry.id === log.inventoryId);
  return {
    ...log,
    actionText: actionMap[log.actionType] || log.actionType,
    createdAtText: formatDateTime(log.createdAt),
    targetTitle: item ? item.title : "已删除货源"
  };
}

function getLogsByInventoryId(inventoryId) {
  return getLogs()
    .filter((log) => log.inventoryId === inventoryId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(decorateLog);
}

function appendLog({ inventoryId, actionType, operator, beforeStatus = "", afterStatus = "", remark = "" }) {
  const logs = getLogs();
  logs.push({
    id: `log_${Date.now()}`,
    inventoryId,
    actionType,
    operatorId: operator.id,
    operatorName: operator.name,
    beforeStatus,
    afterStatus,
    remark,
    createdAt: new Date().toISOString()
  });
  saveLogs(logs);
}

function getAdminRecipientsForItem(item) {
  const creatorGroup = getReviewGroupForItem(item);
  const users = authService.getUsers();
  return users.filter((user) => {
    if (!authService.isAdminUser(user) || user.approvalStatus !== "approved") {
      return false;
    }
    if (authService.isSuperAdmin(user) || user.group === "管理员") {
      return true;
    }
    const approvalGroup = authService.approvalGroupForUser(user);
    return approvalGroup && creatorGroup && approvalGroup === creatorGroup;
  });
}

function canReviewItem(user, item) {
  if (!authService.isAdminUser(user)) {
    return false;
  }
  if (authService.isSuperAdmin(user) || user.group === "管理员") {
    return true;
  }
  const creatorGroup = getReviewGroupForItem(item);
  const approvalGroup = authService.approvalGroupForUser(user);
  return Boolean(approvalGroup && creatorGroup && approvalGroup === creatorGroup);
}

function canViewOwnerInfo(user, item) {
  if (!user || !item) {
    return false;
  }
  return item.creatorId === user.id || canReviewItem(user, item);
}

function addAdminNotice(item, type, title, summary, suffix) {
  notificationService.addNotifications(getAdminRecipientsForItem(item).map((user) => ({
    userId: user.id,
    type,
    title,
    summary,
    itemId: item.id,
    itemType: "supply",
    matchKey: `${type}_${item.id}_${suffix || Date.now()}`
  })));
}

function normalizePayload(formData, user) {
  const isAdmin = authService.isAdminUser(user);
  const stockStatus = formData.stockStatus || "现货";
  const leadTimeDays = Math.max(Number(formData.leadTimeDays) || 0, 0);
  const leadTimeText = leadTimeDays > 0 ? `${leadTimeDays}天` : (stockStatus === "现货" ? "现货" : "0天");
  return {
    title: formData.title,
    businessType: normalizeBusinessType(formData.businessType),
    rentalPrices: normalizeRentalPrices(formData.rentalPrices),
    category: formData.category || "整机服务器",
    condition: formData.condition || "",
    stockStatus,
    leadTimeDays,
    brand: formData.brand,
    model: formData.model,
    configSummary: formData.configSummary || "",
    specDetails: buildSpecDetails(formData),
    ownerInfo: String(formData.ownerInfo || "").trim(),
    sourceType: formData.sourceType || (isAdmin ? SOURCE_TYPES.COMPANY : SOURCE_TYPES.OWN),
    marketType: formData.marketType,
    quantity: Number(formData.quantity) || 0,
    price: formData.price,
    priceUnit: normalizePriceUnit(formData.priceUnit || PRICE_UNITS.CNY_TEN_THOUSAND),
    location: formData.location,
    arrivalDate: formData.arrivalDate || leadTimeText,
    sourceChannel: formData.sourceChannel,
    deliveryDate: formData.deliveryDate || leadTimeText,
    cpu: formData.cpu || "",
    memory: formData.memory || "",
    storage: formData.storage || "",
    m2: formData.m2 || "",
    gpu: formData.gpu || "",
    nic: formData.nic || "",
    contactName: formData.contactName || "",
    contactMethod: formData.contactMethod || "",
    customerTag: formData.customerTag || "老客户",
    imageUrls: Array.isArray(formData.imageUrls) ? formData.imageUrls : [],
    mediaFiles: Array.isArray(formData.mediaFiles) ? formData.mediaFiles : [],
    warranty: formData.warranty || "",
    invoiceType: formData.invoiceType || "",
    packageStatus: formData.packageStatus || "",
    serialNumber: formData.serialNumber || "",
    paymentTerms: formData.paymentTerms || "",
    minOrderQuantity: Number(formData.minOrderQuantity) || 0,
    warehouse: formData.warehouse || "",
    qualityReport: formData.qualityReport || "",
    isUrgent: !!formData.isUrgent,
    remark: formData.remark || "",
    displayTitle: formData.displayTitle || formData.title,
    displayPriority: Number(formData.displayPriority) || 0,
    displayVisible: formData.displayVisible !== false
  };
}

function upsertItem(formData, activeUserId, itemId = "") {
  const user = getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const items = getItems();
  const now = new Date().toISOString();
  const payload = normalizePayload(formData, user);

  if (!itemId) {
    const review = evaluateReview(payload, items);
    const next = {
      id: formData.id || `inv_${Date.now()}`,
      ...payload,
      completeness: review.completeness,
      reviewStatus: review.reviewStatus,
      reviewReason: review.reviewReason,
      reviewAt: review.reviewStatus === REVIEW_STATUS.AUTO ? now : "",
      status: INVENTORY_STATUS.ON_SALE,
      followOwnerId: "",
      followOwnerName: "",
      sellerId: "",
      sellerName: "",
      soldAt: "",
      soldCustomerName: "",
      creatorId: user.id,
      creatorName: user.name,
      createdAt: now,
      updatedAt: now,
      deletedAt: "",
      isDeleted: false,
      displayTags: []
    };
    items.push(next);
    saveItems(items);
    appendLog({ inventoryId: next.id, actionType: LOG_ACTIONS.CREATE, operator: user, afterStatus: next.status, remark: "创建货源信息" });
    return decorateItem(next, activeUserId);
  }

  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (!canEditItem(current, activeUserId)) {
    throw new Error("只能修改自己发布的货源");
  }
  const review = evaluateReview(payload, items, itemId);
  items[targetIndex] = {
    ...current,
    ...payload,
    completeness: review.completeness,
    reviewStatus: review.reviewStatus,
    reviewReason: review.reviewReason,
    reviewAt: review.reviewStatus === REVIEW_STATUS.AUTO ? now : current.reviewAt || "",
    updatedAt: now
  };
  saveItems(items);
  appendLog({ inventoryId: itemId, actionType: LOG_ACTIONS.UPDATE, operator: user, beforeStatus: current.status, afterStatus: current.status, remark: "更新货源信息" });
  return decorateItem(items[targetIndex], activeUserId);
}

function upsertItemToCloud(formData, activeUserId, itemId = "") {
  const local = upsertItem(formData, activeUserId, itemId);
  return cloudApi.saveSupply(local, activeUserId, Boolean(itemId)).then((remoteItem) => {
    const items = getItems();
    const index = items.findIndex((item) => item.id === local.id);
    if (index >= 0) {
      items[index] = {
        ...remoteItem,
        ...items[index],
        imageUrls: remoteItem.imageUrls && remoteItem.imageUrls.length ? remoteItem.imageUrls : items[index].imageUrls,
        mediaFiles: remoteItem.mediaFiles && remoteItem.mediaFiles.length ? remoteItem.mediaFiles : items[index].mediaFiles,
        image: remoteItem.image || items[index].image || "",
        video: remoteItem.video || items[index].video || "",
        updatedAt: remoteItem.updatedAt || items[index].updatedAt,
        status: items[index].status,
        reviewStatus: items[index].reviewStatus,
        offlineReviewStatus: items[index].offlineReviewStatus,
        offlineReason: items[index].offlineReason,
        offlineRequestedAt: items[index].offlineRequestedAt,
        remoteSynced: true
      };
      saveItems(items);
      return decorateItem(items[index], activeUserId);
    }
    saveItems([...items, { ...remoteItem, remoteSynced: true }]);
    return remoteItem;
  });
}

function updateStatus(itemId, activeUserId, nextStatus, remark = "") {
  const user = getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  const next = { ...current, status: nextStatus, updatedAt: new Date().toISOString() };
  next.followCancelPending = false;
  if (nextStatus === INVENTORY_STATUS.FOLLOWING) {
    next.followOwnerId = user.id;
    next.followOwnerName = user.name;
    next.lastFollowedAt = new Date().toISOString();
    next.followReminderSent = false;
  }
  if (nextStatus === INVENTORY_STATUS.SOLD) {
    next.followOwnerId = user.id;
    next.followOwnerName = user.name;
    next.sellerId = user.id;
    next.sellerName = user.name;
    next.soldAt = new Date().toISOString();
  }
  items[targetIndex] = next;
  saveItems(items);
  const actionTypeMap = {
    [INVENTORY_STATUS.FOLLOWING]: LOG_ACTIONS.MARK_FOLLOWING,
    [INVENTORY_STATUS.SOLD]: LOG_ACTIONS.MARK_SOLD,
    [INVENTORY_STATUS.OFFLINE]: LOG_ACTIONS.MARK_OFFLINE,
    [INVENTORY_STATUS.ON_SALE]: LOG_ACTIONS.RESTORE
  };
  appendLog({ inventoryId: itemId, actionType: actionTypeMap[nextStatus], operator: user, beforeStatus: current.status, afterStatus: nextStatus, remark });
  return decorateItem(next, activeUserId);
}

function updateStatusToCloud(itemId, activeUserId, nextStatus, remark = "") {
  const user = getUserById(activeUserId);
  if (nextStatus === INVENTORY_STATUS.SOLD) {
    if (authService.isAdminUser(user)) {
      const next = updateStatus(itemId, activeUserId, nextStatus, remark || "标记已完成");
      return cloudApi.saveStatus(next, activeUserId, "complete_approve", { side: "supply", reason: remark || "标记已完成" })
        .then(() => next)
        .catch((error) => cloudApi.deleteItem(itemId).then(() => next).catch(() => Promise.reject(buildSyncFailure("完成", error))));
    }
    const next = requestCompleteItem(itemId, activeUserId, remark || "标记已完成");
    return cloudApi.saveStatus(next, activeUserId, "complete_request", { side: "supply", reason: next.completionReason })
      .then(() => next)
      .catch((error) => Promise.reject(buildSyncFailure("完成审核申请", error)));
  }
  const next = updateStatus(itemId, activeUserId, nextStatus, remark);
  if (nextStatus === INVENTORY_STATUS.OFFLINE) {
    if (!authService.isAdminUser(user)) {
      const req = requestOfflineItem(itemId, activeUserId, remark);
      return cloudApi.saveStatus(req, activeUserId, "offline_request", { side: "supply", reason: remark })
        .then(() => req)
        .catch((error) => Promise.reject(buildSyncFailure("下架审核申请", error)));
    }
    return cloudApi.saveStatus(next, activeUserId, "offline_approve", { side: "supply", reason: remark })
      .then(() => next)
      .catch((error) => cloudApi.deleteItem(itemId).then(() => next).catch(() => Promise.reject(buildSyncFailure("下架", error))));
  }
  return cloudApi.saveStatus(next, activeUserId, "follow", { side: "supply", reason: remark })
    .then(() => next)
    .catch(() => cloudApi.saveSupply(next, activeUserId, true).then(() => next));
}

function requestCompleteItem(itemId, activeUserId, reason = "") {
  const user = getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (current.status === INVENTORY_STATUS.SOLD || current.status === INVENTORY_STATUS.OFFLINE) {
    throw new Error("该货源已结束");
  }
  if (current.completionReviewStatus === REVIEW_STATUS.PENDING) {
    throw new Error("该货源已提交完成审核");
  }
  const now = new Date().toISOString();
  const reviewGroup = getReviewGroupForItem(current) || (user.group || user.department || "");
  const next = {
    ...current,
    completionReviewStatus: REVIEW_STATUS.PENDING,
    completionReason: String(reason || "标记已完成").trim(),
    completionRequestedAt: now,
    completionRequestedBy: user.id,
    completionRequestedByName: user.name,
    reviewGroup,
    updatedAt: now
  };
  items[targetIndex] = next;
  saveItems(items);
  appendLog({
    inventoryId: itemId,
    actionType: LOG_ACTIONS.UPDATE,
    operator: user,
    beforeStatus: current.status,
    afterStatus: current.status,
    remark: `申请完成审核：${next.completionReason}`
  });
  addAdminNotice(next, "supply_completion_review", "货源完成待审核", `${user.name} 将 ${next.displayTitle || next.title} 标记为已完成`, "pending");
  return decorateItem(next, activeUserId);
}

function cancelFollowItem(itemId, activeUserId) {
  const user = getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (current.status !== INVENTORY_STATUS.FOLLOWING) {
    throw new Error("该货源不在跟进中");
  }
  const isOwnFollow = current.followOwnerId === activeUserId;
  if (!isOwnFollow && !authService.isAdminUser(user)) {
    throw new Error("只能取消自己的跟进");
  }
  const next = {
    ...current,
    status: INVENTORY_STATUS.ON_SALE,
    followOwnerId: "",
    followOwnerName: "",
    lastFollowedAt: current.lastFollowedAt || "",
    followCancelPending: true,
    updatedAt: new Date().toISOString()
  };
  items[targetIndex] = next;
  saveItems(items);
  appendLog({
    inventoryId: itemId,
    actionType: LOG_ACTIONS.RESTORE,
    operator: user,
    beforeStatus: current.status,
    afterStatus: INVENTORY_STATUS.ON_SALE,
    remark: "取消跟进"
  });
  return decorateItem(next, activeUserId);
}

function cancelFollowItemToCloud(itemId, activeUserId) {
  const next = cancelFollowItem(itemId, activeUserId);
  return cloudApi.saveStatus(next, activeUserId, "cancel_follow", { side: "supply" })
    .then(() => next)
    .catch((error) => Promise.reject(buildSyncFailure("取消跟进", error)));
}

function requestOfflineItem(itemId, activeUserId, reason = "") {
  const user = getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (current.creatorId !== activeUserId) {
    throw new Error("只能申请下架自己上传的货源");
  }
  if (!String(reason || "").trim()) {
    throw new Error("请填写下架原因");
  }
  if (current.status === INVENTORY_STATUS.OFFLINE) {
    throw new Error("该货源已下架");
  }
  if (current.offlineReviewStatus === REVIEW_STATUS.PENDING) {
    throw new Error("该货源已提交下架审核");
  }
  const now = new Date().toISOString();
  const next = {
    ...current,
    offlineReviewStatus: REVIEW_STATUS.PENDING,
    offlineReason: String(reason).trim(),
    offlineRequestedAt: now,
    offlineRequestedBy: user.id,
    offlineRequestedByName: user.name,
    updatedAt: now
  };
  items[targetIndex] = next;
  saveItems(items);
  appendLog({
    inventoryId: itemId,
    actionType: LOG_ACTIONS.UPDATE,
    operator: user,
    beforeStatus: current.status,
    afterStatus: current.status,
    remark: `申请下架：${next.offlineReason}`
  });
  addAdminNotice(next, "supply_offline_review", "货源下架待审核", `${user.name} 申请下架 ${next.displayTitle || next.title}`, "pending");
  return decorateItem(next, activeUserId);
}

function requestOfflineItemToCloud(itemId, activeUserId, reason = "") {
  const next = requestOfflineItem(itemId, activeUserId, reason);
  return cloudApi.saveStatus(next, activeUserId, "offline_request", { side: "supply", reason: next.offlineReason })
    .then(() => next)
    .catch((error) => Promise.reject(buildSyncFailure("下架审核申请", error)));
}

function directOfflineItem(itemId, activeUserId, reason = "") {
  const user = getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (current.creatorId !== activeUserId && !authService.isAdminUser(user)) {
    throw new Error("只能下架自己上传的货源");
  }
  if (current.status === INVENTORY_STATUS.OFFLINE) {
    throw new Error("该货源已下架");
  }
  if (current.offlineReviewStatus === REVIEW_STATUS.PENDING) {
    throw new Error("该货源已在审核中，请等待审批结果");
  }
  const now = new Date().toISOString();
  const next = {
    ...current,
    status: INVENTORY_STATUS.OFFLINE,
    offlineReviewStatus: REVIEW_STATUS.APPROVED,
    offlineReason: String(reason || "货源已在别处售出").trim(),
    offlineRequestedAt: now,
    offlineRequestedBy: user.id,
    offlineRequestedByName: user.name,
    offlineReviewedAt: now,
    offlineReviewedBy: user.id,
    offlineReviewedByName: user.name,
    offlineAutoApproved: true,
    updatedAt: now
  };
  items[targetIndex] = next;
  saveItems(items);
  appendLog({
    inventoryId: itemId,
    actionType: LOG_ACTIONS.MARK_OFFLINE,
    operator: user,
    beforeStatus: current.status,
    afterStatus: next.status,
    remark: `直接下架：${next.offlineReason}`
  });
  addAdminNotice(next, "supply_offline_notice", "货源已下架", `${user.name} 因“${next.offlineReason}”下架了 ${next.displayTitle || next.title}`, "direct");
  return decorateItem(next, activeUserId);
}

function directOfflineItemToCloud(itemId, activeUserId, reason = "") {
  const next = directOfflineItem(itemId, activeUserId, reason);
  return cloudApi.saveStatus(next, activeUserId, "offline", { side: "supply", reason })
    .then(() => next)
    .catch((error) => cloudApi.deleteItem(itemId).then(() => next).catch(() => Promise.reject(buildSyncFailure("下架", error))));
}

function confirmRemoteReviewState(itemId, predicate, message) {
  return cloudApi.fetchItems("supply").then((remoteItems) => {
    const remote = remoteItems.find((item) => item.id === itemId);
    if (!remote || predicate(remote)) {
      return remote;
    }
    throw new Error(message);
  });
}

function deleteItem(itemId, activeUserId) {
  const user = getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (!canEditItem(current, activeUserId)) {
    throw new Error("只能删除自己发布的货源");
  }
  items[targetIndex] = { ...current, isDeleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  saveItems(items);
  appendLog({ inventoryId: itemId, actionType: LOG_ACTIONS.DELETE, operator: user, beforeStatus: current.status, afterStatus: current.status, remark: "逻辑删除货源" });
}

function updateReviewStatus(itemId, activeUserId, nextReviewStatus, remark = "") {
  const user = getUserById(activeUserId);
  if (!authService.isAdminUser(user)) {
    throw new Error("仅管理员可审核上传信息");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (!canReviewItem(user, current)) {
    throw new Error("只能审核自己负责分组的信息");
  }
  if (current.reviewStatus !== REVIEW_STATUS.PENDING) {
    throw new Error("该信息已处理");
  }
  const now = new Date().toISOString();
  const next = {
    ...current,
    reviewStatus: nextReviewStatus,
    reviewReason: remark || (nextReviewStatus === REVIEW_STATUS.APPROVED ? "管理员审核通过" : "管理员审核拒绝"),
    reviewAt: now,
    reviewBy: user.id,
    reviewByName: user.name,
    updatedAt: now
  };
  if (nextReviewStatus === REVIEW_STATUS.REJECTED) {
    next.isDeleted = true;
    next.deletedAt = now;
  }
  items[targetIndex] = next;
  saveItems(items);
  appendLog({
    inventoryId: itemId,
    actionType: LOG_ACTIONS.UPDATE,
    operator: user,
    beforeStatus: current.status,
    afterStatus: current.status,
    remark: next.reviewReason
  });
  return decorateItem(next, activeUserId);
}

function approveReviewItem(itemId, activeUserId) {
  return updateReviewStatus(itemId, activeUserId, REVIEW_STATUS.APPROVED, "管理员审核通过");
}

function rejectReviewItem(itemId, activeUserId) {
  return updateReviewStatus(itemId, activeUserId, REVIEW_STATUS.REJECTED, "管理员审核拒绝");
}

function updateOfflineReview(itemId, activeUserId, approved) {
  const user = getUserById(activeUserId);
  if (!authService.isAdminUser(user)) {
    throw new Error("仅管理员可审核下架申请");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (!canReviewItem(user, current)) {
    throw new Error("只能审核自己负责分组的信息");
  }
  if (current.offlineReviewStatus !== REVIEW_STATUS.PENDING) {
    throw new Error("该下架申请已处理");
  }
  const now = new Date().toISOString();
  const next = {
    ...current,
    offlineReviewStatus: approved ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.REJECTED,
    offlineReviewedAt: now,
    offlineReviewedBy: user.id,
    offlineReviewedByName: user.name,
    updatedAt: now
  };
  if (approved) {
    next.status = INVENTORY_STATUS.OFFLINE;
  } else {
    next.status = INVENTORY_STATUS.ON_SALE;
  }
  items[targetIndex] = next;
  saveItems(items);
  appendLog({
    inventoryId: itemId,
    actionType: approved ? LOG_ACTIONS.MARK_OFFLINE : LOG_ACTIONS.UPDATE,
    operator: user,
    beforeStatus: current.status,
    afterStatus: next.status,
    remark: approved ? `审核通过下架：${current.offlineReason}` : `审核拒绝下架：${current.offlineReason}`
  });
  return decorateItem(next, activeUserId);
}

function approveOfflineRequest(itemId, activeUserId) {
  return updateOfflineReview(itemId, activeUserId, true);
}

function approveOfflineRequestToCloud(itemId, activeUserId) {
  const next = approveOfflineRequest(itemId, activeUserId);
  return cloudApi.saveStatus(next, activeUserId, "offline_approve", { side: "supply", reason: next.offlineReason })
    .catch(() => cloudApi.deleteItem(itemId))
    .then(() => confirmRemoteReviewState(
      itemId,
      (remote) => remote.status === INVENTORY_STATUS.OFFLINE
        || remote.offlineReviewStatus === REVIEW_STATUS.APPROVED
        || remote.remoteDeleted,
      "网页端下架审批状态未确认，本地已通过，请稍后刷新"
    ))
    .then(() => next);
}

function rejectOfflineRequest(itemId, activeUserId) {
  const next = updateOfflineReview(itemId, activeUserId, false);
  return cloudApi.saveStatus(next, activeUserId, "offline_reject", { side: "supply", reason: next.offlineReason })
    .then(() => next)
    .catch((error) => Promise.reject(buildSyncFailure("下架审核拒绝", error)));
}

function updateCompletionReview(itemId, activeUserId, approved) {
  const user = getUserById(activeUserId);
  if (!authService.isAdminUser(user)) {
    throw new Error("仅管理员可审核完成申请");
  }
  const items = getItems();
  const targetIndex = items.findIndex((item) => item.id === itemId && !item.isDeleted);
  if (targetIndex < 0) {
    throw new Error("货源不存在");
  }
  const current = items[targetIndex];
  if (!canReviewItem(user, current)) {
    throw new Error("只能审核自己负责分组的信息");
  }
  if (current.completionReviewStatus !== REVIEW_STATUS.PENDING) {
    throw new Error("该完成申请已处理");
  }
  const now = new Date().toISOString();
  const next = {
    ...current,
    completionReviewStatus: approved ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.REJECTED,
    completionReviewedAt: now,
    completionReviewedBy: user.id,
    completionReviewedByName: user.name,
    updatedAt: now
  };
  if (approved) {
    next.status = INVENTORY_STATUS.SOLD;
    next.soldAt = now;
    next.sellerId = current.completionRequestedBy || current.creatorId;
    next.sellerName = current.completionRequestedByName || current.creatorName;
    next.offlineByCompletion = true;
  }
  items[targetIndex] = next;
  saveItems(items);
  appendLog({
    inventoryId: itemId,
    actionType: approved ? LOG_ACTIONS.MARK_SOLD : LOG_ACTIONS.UPDATE,
    operator: user,
    beforeStatus: current.status,
    afterStatus: next.status,
    remark: approved ? `审核通过完成：${current.completionReason}` : `审核拒绝完成：${current.completionReason}`
  });
  return decorateItem(next, activeUserId);
}

function approveCompletionRequest(itemId, activeUserId) {
  return updateCompletionReview(itemId, activeUserId, true);
}

function approveCompletionRequestToCloud(itemId, activeUserId) {
  const next = approveCompletionRequest(itemId, activeUserId);
  return cloudApi.saveStatus(next, activeUserId, "complete_approve", { side: "supply", reason: next.completionReason })
    .catch(() => cloudApi.deleteItem(itemId))
    .then(() => confirmRemoteReviewState(
      itemId,
      (remote) => remote.status === INVENTORY_STATUS.SOLD
        || remote.completionReviewStatus === REVIEW_STATUS.APPROVED
        || remote.remoteDeleted,
      "网页端完成审批状态未确认，本地已通过，请稍后刷新"
    ))
    .then(() => next);
}

function rejectCompletionRequest(itemId, activeUserId) {
  const next = updateCompletionReview(itemId, activeUserId, false);
  return cloudApi.saveStatus(next, activeUserId, "complete_reject", { side: "supply", reason: next.completionReason })
    .then(() => next)
    .catch((error) => Promise.reject(buildSyncFailure("完成审核拒绝", error)));
}

function getBoardData(filters = {}) {
  const currentUser = filters.currentUserId ? getUserById(filters.currentUserId) : null;
  const items = filterItems(filters);
  const allItems = getItems().map(normalizeLegacyItem);
  return {
    stats: buildStats(allItems),
    list: items,
    reviewQueueCount: allItems.filter((item) => !item.isDeleted && item.reviewStatus === REVIEW_STATUS.PENDING).length,
    canSeeAll: authService.isAdminUser(currentUser)
  };
}

function getTimeline() {
  return getLogs().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(decorateLog);
}

function getMarketSnapshot(product = "") {
  const normalizedProduct = String(product || "").trim().toLowerCase();
  const items = getItems()
    .map(normalizeLegacyItem)
    .filter((item) => !item.isDeleted && item.reviewStatus !== REVIEW_STATUS.PENDING)
    .filter((item) => {
      if (!normalizedProduct) {
        return true;
      }
      return [item.model, item.title, item.displayTitle, item.brand]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedProduct);
    });
  const pricePoints = items
    .slice()
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    .map((item) => ({ label: item.model, price: Number(item.price) || 0, time: item.updatedAt, quantity: Number(item.quantity) || 0 }));
  const latest = pricePoints.slice(-8);
  const midpoint = latest.length ? latest.reduce((sum, item) => sum + item.price, 0) / latest.length : 0;
  return {
    midpoint: midpoint ? midpoint.toFixed(0) : "0",
    pricePoints,
    asks: latest.slice().sort((a, b) => b.price - a.price).slice(0, 3),
    bids: latest.slice().sort((a, b) => a.price - b.price).slice(0, 3),
    totalVolume: latest.reduce((sum, item) => sum + item.quantity, 0)
  };
}

function scoreUser(items) {
  const created = items.filter((item) => !item.isDeleted).length;
  const sold = items.filter((item) => !item.isDeleted && item.status === INVENTORY_STATUS.SOLD).length;
  const following = items.filter((item) => !item.isDeleted && item.status === INVENTORY_STATUS.FOLLOWING).length;
  const offline = items.filter((item) => !item.isDeleted && item.status === INVENTORY_STATUS.OFFLINE).length;
  const approved = items.filter((item) => !item.isDeleted && item.reviewStatus !== REVIEW_STATUS.PENDING).length;
  const completionRate = created ? sold / created : 0;
  const approvalRate = created ? approved / created : 0;
  return { created, sold, following, offline, completionRate, approvalRate, trustScore: created >= 20 ? Math.round(completionRate * 70 + approvalRate * 30) : null };
}

function getPeriodMetrics(items) {
  const now = new Date();
  const todayKey = formatDateTime(now).slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const activeItems = items.filter((item) => !item.isDeleted);
  const todayPublished = activeItems.filter((item) => item.createdAt && item.createdAt.slice(0, 10) === todayKey).length;
  const todaySold = activeItems.filter((item) => item.soldAt && item.soldAt.slice(0, 10) === todayKey).length;
  const weekPublished = activeItems.filter((item) => item.createdAt && new Date(item.createdAt) >= weekStart).length;
  const weekSold = activeItems.filter((item) => item.soldAt && new Date(item.soldAt) >= weekStart).length;
  const weekOffline = activeItems.filter((item) => {
    return item.status === INVENTORY_STATUS.OFFLINE && item.offlineReviewedAt && new Date(item.offlineReviewedAt) >= weekStart;
  }).length;
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekPublished = activeItems.filter((item) => {
    const date = item.createdAt ? new Date(item.createdAt) : null;
    return date && date >= lastWeekStart && date < weekStart;
  }).length;
  const lastWeekSold = activeItems.filter((item) => {
    const date = item.soldAt ? new Date(item.soldAt) : null;
    return date && date >= lastWeekStart && date < weekStart;
  }).length;
  return {
    todayPublished,
    todaySold,
    weekPublished,
    weekSold,
    weekOffline,
    publishGrowth: weekPublished - lastWeekPublished,
    soldGrowth: weekSold - lastWeekSold,
    publishGrowthText: `${weekPublished - lastWeekPublished >= 0 ? "+" : ""}${weekPublished - lastWeekPublished}`,
    soldGrowthText: `${weekSold - lastWeekSold >= 0 ? "+" : ""}${weekSold - lastWeekSold}`
  };
}


function buildTrendData(items, days = 7) {
  const activeItems = items.filter((item) => !item.isDeleted);
  const today = new Date();
  const raw = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - offset);
    const key = formatDateTime(date).slice(0, 10);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    const published = activeItems.filter((item) => item.createdAt && item.createdAt.slice(0, 10) === key).length;
    const sold = activeItems.filter((item) => item.soldAt && item.soldAt.slice(0, 10) === key).length;
    raw.push({ key, label, published, sold });
  }
  const maxValue = Math.max(1, ...raw.map((item) => Math.max(item.published, item.sold)));
  return raw.map((item) => ({
    ...item,
    publishedHeight: Math.max(8, Math.round((item.published / maxValue) * 100)),
    soldHeight: Math.max(8, Math.round((item.sold / maxValue) * 100))
  }));
}

function buildUserStats(items) {
  const users = getUsers();
  const activeItems = items.map(normalizeLegacyItem).filter((item) => !item.isDeleted);
  return users.map((user) => {
    const ownedItems = activeItems.filter((item) => item.creatorId === user.id);
    const soldItems = activeItems.filter((item) => item.sellerId === user.id);
    const followedItems = activeItems.filter((item) => item.followOwnerId === user.id);
    const offlineItems = ownedItems.filter((item) => item.status === INVENTORY_STATUS.OFFLINE);
    const trust = scoreUser(ownedItems);
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      roleLabel: user.roleLabel,
      department: user.department || "",
      title: user.title || "",
      created: ownedItems.length,
      sold: soldItems.length,
      following: followedItems.length,
      offline: offlineItems.length,
      completionRateText: `${Math.round(trust.completionRate * 100)}%`,
      trustScoreText: trust.trustScore === null ? "发布不足20条" : `${trust.trustScore}`
    };
  }).sort((a, b) => b.created - a.created);
}
function getMyDashboard(userId) {
  const user = authService.getUsers().find((item) => item.id === userId) || getUserById(userId);
  const decoratedItems = getItems().map((item) => decorateItem(item, userId));
  const activeItems = decoratedItems.filter((item) => !item.isDeleted);
  if (authService.isAdminUser(user)) {
    const rawItems = getItems();
    const metrics = getPeriodMetrics(rawItems);
    const trendData = buildTrendData(rawItems);
    const peopleStats = buildUserStats(rawItems);
    return {
      user,
      isAdminDashboard: true,
      myItems: activeItems,
      peopleStats,
      mineStats: {
        created: activeItems.length,
        sold: activeItems.filter((item) => item.status === INVENTORY_STATUS.SOLD).length,
        following: activeItems.filter((item) => item.status === INVENTORY_STATUS.FOLLOWING).length,
        offline: activeItems.filter((item) => item.status === INVENTORY_STATUS.OFFLINE).length,
        ...metrics,
        trendData
      }
    };
  }
  const myItems = activeItems.filter((item) => item.creatorId === userId);
  const soldItems = activeItems.filter((item) => item.sellerId === userId);
  const followedItems = activeItems.filter((item) => item.followOwnerId === userId);
  const offlineItems = myItems.filter((item) => item.status === INVENTORY_STATUS.OFFLINE);
  const trust = scoreUser(myItems);
  return {
    user,
    isAdminDashboard: false,
    myItems,
    mineStats: {
      created: myItems.length,
      sold: soldItems.length,
      following: followedItems.length,
      offline: offlineItems.length,
      completionRateText: `${Math.round(trust.completionRate * 100)}%`,
      approvalRateText: `${Math.round(trust.approvalRate * 100)}%`,
      trustScore: trust.trustScore,
      trustScoreText: trust.trustScore === null ? "发布不足20条" : `${trust.trustScore}`
    }
  };
}

function getAdminDashboard(adminId = "") {
  const admin = adminId ? getUserById(adminId) : null;
  const rawItems = getItems();
  let itemsChanged = false;
  const normalizedItems = rawItems.map((item) => {
    if (
      (item.reviewStatus === REVIEW_STATUS.PENDING
        || item.offlineReviewStatus === REVIEW_STATUS.PENDING
        || item.completionReviewStatus === REVIEW_STATUS.PENDING)
      && !item.reviewGroup
    ) {
      const reviewGroup = getReviewGroupForItem(item);
      if (reviewGroup) {
        itemsChanged = true;
        return { ...item, reviewGroup };
      }
    }
    return item;
  });
  if (itemsChanged) {
    saveItems(normalizedItems);
  }
  const items = normalizedItems.map(normalizeLegacyItem).filter((item) => !item.isDeleted);
  const reviewableItems = admin ? items.filter((item) => canReviewItem(admin, item)) : items;
  const userStats = buildUserStats(items);
  return {
    stats: buildStats(items),
    periodStats: getPeriodMetrics(items),
    userStats,
    pendingReviewItems: reviewableItems.filter((item) => item.reviewStatus === REVIEW_STATUS.PENDING).map((item) => decorateItem(item)),
    pendingOfflineItems: reviewableItems.filter((item) => item.offlineReviewStatus === REVIEW_STATUS.PENDING).map((item) => decorateItem(item)),
    pendingCompletionItems: reviewableItems.filter((item) => item.completionReviewStatus === REVIEW_STATUS.PENDING).map((item) => decorateItem(item)),
    market: getMarketSnapshot()
  };
}

function getScreenPayload() {
  const items = getItems()
    .map(normalizeLegacyItem)
    .filter((item) => item.displayVisible && !item.isDeleted)
    .map(pickVisibleFields)
    .sort((a, b) => b.displayPriority - a.displayPriority);
  return { generatedAt: new Date().toISOString(), summary: buildStats(getItems()), items };
}

module.exports = {
  ensureSeedData,
  clearLocalOnlyItems,
  getBootstrapItems,
  refreshCloudItems,
  getUsers,
  getUserById,
  getBoardData,
  getItemById,
  getLogsByInventoryId,
  getTimeline,
  getMarketSnapshot,
  getAdminDashboard,
  upsertItem,
  upsertItemToCloud,
  updateStatus,
  updateStatusToCloud,
  cancelFollowItem,
  cancelFollowItemToCloud,
  requestCompleteItem,
  requestOfflineItem,
  requestOfflineItemToCloud,
  directOfflineItem,
  directOfflineItemToCloud,
  approveReviewItem,
  rejectReviewItem,
  approveCompletionRequest,
  approveCompletionRequestToCloud,
  rejectCompletionRequest,
  approveOfflineRequest,
  approveOfflineRequestToCloud,
  rejectOfflineRequest,
  deleteItem,
  getMyDashboard,
  getScreenPayload
};
