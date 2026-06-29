const { clone, formatDateTime } = require("../utils/helpers");
const notificationService = require("./notifications");
const authService = require("./auth");
const cloudApi = require("./cloud-api");
const { BUSINESS_TYPES, REVIEW_STATUS, PRICE_UNITS, normalizePriceUnit, getPriceUnitLabel } = require("../utils/constants");

const STORAGE_KEY = "inventory_board_demands";
const LOG_STORAGE_KEY = "inventory_board_demand_logs";

function normalizeBusinessType(value) {
  return [BUSINESS_TYPES.SALE, BUSINESS_TYPES.RENT, BUSINESS_TYPES.BOTH].includes(value) ? value : BUSINESS_TYPES.SALE;
}

function isRentDemand(value) {
  const businessType = normalizeBusinessType(value);
  return businessType === BUSINESS_TYPES.RENT || businessType === BUSINESS_TYPES.BOTH;
}

function isBuyDemand(value) {
  const businessType = normalizeBusinessType(value);
  return businessType === BUSINESS_TYPES.SALE || businessType === BUSINESS_TYPES.BOTH;
}

function getBusinessTypeText(value) {
  const businessType = normalizeBusinessType(value);
  if (businessType === BUSINESS_TYPES.RENT) {
    return "求租";
  }
  if (businessType === BUSINESS_TYPES.BOTH) {
    return "可买可租";
  }
  return "求买";
}

function buildRentalBudgetText(item) {
  if (!isRentDemand(item.businessType)) {
    return "";
  }
  const min = item.rentalBudgetMin || "";
  const max = item.rentalBudgetMax || "";
  const budget = min || max ? `${min || 0}-${max || 0}万/月/台` : "租金面议";
  return [item.rentalTerm, item.rentalMode, budget].filter(Boolean).join(" / ");
}
function ensureSeedData() {
  const list = wx.getStorageSync(STORAGE_KEY);
  if (!list || !Array.isArray(list)) {
    wx.setStorageSync(STORAGE_KEY, []);
  } else {
    const retained = list.filter((item) => !item.isDeleted && !isMockDemoDemand(item));
    if (retained.length !== list.length) {
      saveDemands(retained);
    }
  }
  const logs = wx.getStorageSync(LOG_STORAGE_KEY);
  if (!logs || !Array.isArray(logs)) {
    wx.setStorageSync(LOG_STORAGE_KEY, []);
  } else {
    const retainedLogs = logs.filter((log) => !isMockDemoDemandLog(log));
    if (retainedLogs.length !== logs.length) {
      wx.setStorageSync(LOG_STORAGE_KEY, retainedLogs);
    }
  }
  notificationService.ensureSeedData();
}

function isMockDemoDemand(item = {}) {
  return item.id === "dem_001"
    || (item.title === "深圳客户急需 R760" && item.creatorName === "李娜");
}

function isMockDemoDemandLog(log = {}) {
  return log.demandId === "dem_001"
    || log.id === "dem_log_seed_create_dem_001"
    || (log.operatorName === "李娜" && log.targetTitle === "深圳客户急需 R760");
}

function getDemands() {
  ensureSeedData();
  return clone(wx.getStorageSync(STORAGE_KEY) || []);
}

function isRemoteUrl(value = "") {
  return /^https?:\/\//i.test(String(value || ""));
}

function compactDemandForStorage(item) {
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

function minimalDemandForStorage(item) {
  return {
    id: item.id,
    remoteSynced: !!item.remoteSynced,
    title: item.title || "",
    customerTag: item.customerTag || "",
    brand: item.brand || "",
    model: item.model || "",
    gpu: item.gpu || "",
    quantity: item.quantity || 0,
    budgetMin: item.budgetMin || "",
    budgetMax: item.budgetMax || "",
    budgetUnit: normalizePriceUnit(item.budgetUnit),
    deliveryDays: item.deliveryDays || 0,
    deliveryDate: item.deliveryDate || "",
    region: item.region || "",
    contactName: item.contactName || "",
    contactPhone: item.contactPhone || "",
    businessType: item.businessType || BUSINESS_TYPES.SALE,
    rentalTerm: item.rentalTerm || "",
    rentalMode: item.rentalMode || "",
    rentalBudgetMin: item.rentalBudgetMin || "",
    rentalBudgetMax: item.rentalBudgetMax || "",
    status: item.status || "pending",
    followOwnerId: item.followOwnerId || "",
    followOwnerName: item.followOwnerName || "",
    lastFollowedAt: item.lastFollowedAt || "",
    followReminderSent: !!item.followReminderSent,
    followCancelPending: !!item.followCancelPending,
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
    reviewGroup: item.reviewGroup || "",
    doneAt: item.doneAt || "",
    isUrgent: !!item.isUrgent,
    remark: item.remark || "",
    sourceType: item.sourceType || "own",
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

function saveDemands(list) {
  const compacted = list.map(compactDemandForStorage);
  try {
    setStorageSafely(STORAGE_KEY, clone(compacted));
  } catch (error) {
    setStorageSafely(STORAGE_KEY, clone(compacted.map(minimalDemandForStorage)));
  }
}

function isFinalReviewStatus(status) {
  return status === REVIEW_STATUS.APPROVED || status === REVIEW_STATUS.REJECTED;
}

function preserveFinalReviewState(remote, existing) {
  const keepOffline = isFinalReviewStatus(existing.offlineReviewStatus) && existing.offlineReviewedAt
    && remote.offlineReviewStatus !== REVIEW_STATUS.PENDING
    && remote.offlineReviewStatus !== existing.offlineReviewStatus;
  const keepCompletion = isFinalReviewStatus(existing.completionReviewStatus) && existing.completionReviewedAt
    && remote.completionReviewStatus !== existing.completionReviewStatus;
  const next = { ...remote };
  if (keepOffline) {
    next.status = existing.offlineReviewStatus === REVIEW_STATUS.APPROVED ? "offline" : existing.status;
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
    next.status = existing.completionReviewStatus === REVIEW_STATUS.APPROVED ? "done" : next.status || existing.status;
    next.completionReviewStatus = existing.completionReviewStatus;
    next.completionReason = existing.completionReason || remote.completionReason || "";
    next.completionRequestedAt = existing.completionRequestedAt || remote.completionRequestedAt || "";
    next.completionRequestedBy = existing.completionRequestedBy || remote.completionRequestedBy || "";
    next.completionRequestedByName = existing.completionRequestedByName || remote.completionRequestedByName || "";
    next.completionReviewedAt = existing.completionReviewedAt;
    next.completionReviewedBy = existing.completionReviewedBy || "";
    next.completionReviewedByName = existing.completionReviewedByName || "";
    next.doneAt = existing.doneAt || remote.doneAt || "";
  }
  return next;
}

function getDemandLogs() {
  ensureSeedData();
  return clone(wx.getStorageSync(LOG_STORAGE_KEY) || []);
}

function getRawDemandLogs() {
  const logs = wx.getStorageSync(LOG_STORAGE_KEY);
  return Array.isArray(logs) ? logs : [];
}

function getCreatedAtTime(row = {}) {
  const time = new Date(row.createdAt || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function takeRecentRows(rows, limit) {
  const count = Number(limit) || 0;
  if (!count || rows.length <= count) {
    return rows.slice().sort((a, b) => getCreatedAtTime(b) - getCreatedAtTime(a));
  }
  const recent = [];
  rows.forEach((row) => {
    const rowTime = getCreatedAtTime(row);
    let insertAt = recent.findIndex((item) => rowTime > getCreatedAtTime(item));
    if (insertAt < 0) {
      insertAt = recent.length;
    }
    if (insertAt < count) {
      recent.splice(insertAt, 0, row);
      if (recent.length > count) {
        recent.pop();
      }
    }
  });
  return recent;
}

function saveDemandLogs(list) {
  wx.setStorageSync(LOG_STORAGE_KEY, clone(list));
}

function appendDemandLog({ demandId, actionType, operator, beforeStatus = "", afterStatus = "", remark = "" }) {
  const logs = getDemandLogs();
  const demand = getDemands().find((item) => item.id === demandId);
  logs.push({
    id: `dem_log_${Date.now()}`,
    demandId,
    actionType,
    actionText: actionType,
    targetTitle: demand ? demand.title : "已删除需求",
    operatorId: operator.id,
    operatorName: operator.name,
    beforeStatus,
    afterStatus,
    remark,
    createdAt: new Date().toISOString()
  });
  saveDemandLogs(logs);
}

function ensureCreateLogsFromDemands() {
  const demands = getDemands().filter((item) => !item.isDeleted);
  const logs = getDemandLogs();
  const loggedIds = new Set(
    logs
      .filter((log) => log.actionType === "create" && log.demandId)
      .map((log) => log.demandId)
  );
  const missingLogs = demands
    .filter((item) => item.id && !loggedIds.has(item.id))
    .map((item) => ({
      id: `dem_log_seed_create_${item.id}`,
      demandId: item.id,
      actionType: "create",
      actionText: "新增需求",
      targetTitle: item.title || "未命名需求",
      operatorId: item.creatorId || "",
      operatorName: item.creatorName || item.contactName || "未知人员",
      beforeStatus: "",
      afterStatus: item.status || "pending",
      remark: item.remoteSynced ? "根据需求发布时间自动补记" : "根据本地需求发布时间自动补记",
      createdAt: item.createdAt || item.updatedAt || new Date().toISOString()
    }));
  if (missingLogs.length) {
    saveDemandLogs([...logs, ...missingLogs]);
  }
}

function getTimeline(options = {}) {
  const limit = Number(options.limit) || 0;
  if (limit > 0) {
    return takeRecentRows(getRawDemandLogs(), limit).map((log) => ({
        ...log,
        createdAtText: formatDateTime(log.createdAt),
        itemType: "demand"
      }));
  }
  ensureCreateLogsFromDemands();
  const logs = getDemandLogs()
    .sort((a, b) => getCreatedAtTime(b) - getCreatedAtTime(a));
  return (limit > 0 ? logs.slice(0, limit) : logs)
    .map((log) => ({
      ...log,
      createdAtText: formatDateTime(log.createdAt),
      itemType: "demand"
    }));
}

function getTimelineCount() {
  return getRawDemandLogs().length;
}

function mergeRemoteDemands(remoteDemands) {
  const localList = getDemands();
  const localById = new Map(localList.map((item) => [item.id, item]));
  const remoteIds = new Set(remoteDemands.map((item) => item.id));
  const mergedRemote = remoteDemands.map((remote) => {
    const existing = localById.get(remote.id);
    if (!existing) {
      return remote;
    }
    const remoteStatus = remote.status || (remote.remoteDeleted ? "offline" : "");
    const completionApprovedByRemote = existing.completionReviewStatus === REVIEW_STATUS.PENDING
      && remoteStatus === "done";
    const offlineApprovedByRemote = existing.offlineReviewStatus === REVIEW_STATUS.PENDING
      && remoteStatus === "offline";
    const localCancelFollowPending = !!existing.followCancelPending
      && existing.status === "pending"
      && remoteStatus === "following";
    return preserveFinalReviewState({
      ...remote,
      status: localCancelFollowPending ? existing.status : (completionApprovedByRemote ? "done" : (offlineApprovedByRemote ? "offline" : (remoteStatus || existing.status))),
      followOwnerId: localCancelFollowPending ? "" : (remote.followOwnerId || existing.followOwnerId || ""),
      followOwnerName: localCancelFollowPending ? "" : (remote.followOwnerName || existing.followOwnerName || ""),
      lastFollowedAt: localCancelFollowPending ? "" : (remote.lastFollowedAt || existing.lastFollowedAt || ""),
      followReminderSent: localCancelFollowPending ? false : (remote.followReminderSent || existing.followReminderSent || false),
      followCancelPending: localCancelFollowPending,
      offlineReviewStatus: remote.offlineReviewStatus === REVIEW_STATUS.PENDING ? REVIEW_STATUS.PENDING : (offlineApprovedByRemote ? REVIEW_STATUS.APPROVED : (remote.offlineReviewStatus || existing.offlineReviewStatus)),
      offlineReason: remote.offlineReviewStatus === REVIEW_STATUS.PENDING ? (remote.offlineReason || existing.offlineReason || "") : (existing.offlineReason || remote.offlineReason || ""),
      offlineRequestedAt: remote.offlineReviewStatus === REVIEW_STATUS.PENDING ? (remote.offlineRequestedAt || existing.offlineRequestedAt || "") : existing.offlineRequestedAt,
      offlineRequestedBy: remote.offlineReviewStatus === REVIEW_STATUS.PENDING ? (remote.offlineRequestedBy || existing.offlineRequestedBy || "") : existing.offlineRequestedBy,
      offlineRequestedByName: remote.offlineReviewStatus === REVIEW_STATUS.PENDING ? (remote.offlineRequestedByName || existing.offlineRequestedByName || "") : existing.offlineRequestedByName,
      completionReviewStatus: completionApprovedByRemote ? REVIEW_STATUS.APPROVED : (remote.completionReviewStatus || existing.completionReviewStatus),
      completionReason: existing.completionReason || remote.completionReason || "",
      completionRequestedAt: existing.completionRequestedAt,
      completionRequestedBy: existing.completionRequestedBy,
      completionRequestedByName: existing.completionRequestedByName,
      doneAt: completionApprovedByRemote ? (existing.doneAt || remote.doneAt || remote.updatedAt || new Date().toISOString()) : (existing.doneAt || remote.doneAt || ""),
      completionReviewedAt: completionApprovedByRemote ? (existing.completionReviewedAt || remote.completionReviewedAt || remote.updatedAt || new Date().toISOString()) : (remote.completionReviewedAt || existing.completionReviewedAt),
      offlineReviewedAt: remote.offlineReviewStatus === REVIEW_STATUS.PENDING ? "" : (offlineApprovedByRemote ? (existing.offlineReviewedAt || remote.offlineReviewedAt || remote.updatedAt || new Date().toISOString()) : (remote.offlineReviewedAt || existing.offlineReviewedAt))
    }, existing);
  });
  const retainedLocal = localList.filter((item) => {
    if (remoteIds.has(item.id) || item.isDeleted || item.remoteSynced) {
      return false;
    }
    return item.status === "offline" || item.status === "done" || item.offlineReviewStatus === REVIEW_STATUS.PENDING || item.completionReviewStatus === REVIEW_STATUS.PENDING;
  });
  saveDemands([...mergedRemote, ...retainedLocal]);
}

function refreshCloudDemands() {
  return retryPendingDemandSync().then(() => cloudApi.fetchItems("demand")).then((remoteDemands) => {
    mergeRemoteDemands(remoteDemands);
    return remoteDemands;
  });
}

function buildSyncFailure(actionText, error) {
  const detail = error && error.message ? error.message : "请稍后重试";
  return new Error(`${actionText}已保存到本地，但同步失败：${detail}`);
}

function retryPendingDemandSync(activeUserId) {
  const pending = getDemands().filter((item) => !item.isDeleted && item.syncPending && !item.remoteSynced);
  return Promise.all(pending.map((item) => {
    return cloudApi.saveDemand(item, activeUserId || item.creatorId, Boolean(item.remoteSynced))
      .then((remoteDemand) => {
        const list = getDemands();
        const index = list.findIndex((entry) => entry.id === item.id);
        if (index >= 0) {
          list[index] = {
            ...remoteDemand,
            ...list[index],
            remoteSynced: true,
            syncPending: false,
            syncError: "",
            updatedAt: remoteDemand.updatedAt || list[index].updatedAt
          };
          saveDemands(list);
        }
        return remoteDemand;
      })
      .catch((error) => {
        const list = getDemands();
        const index = list.findIndex((entry) => entry.id === item.id);
        if (index >= 0) {
          list[index] = { ...list[index], syncPending: true, syncError: error.message || "同步失败" };
          saveDemands(list);
        }
        return null;
      });
  }));
}

function applyRemoteDemandResult(res, demandId) {
  const remote = res && (res.item || res);
  if (remote && remote.id) {
    mergeRemoteDemands([remote]);
  }
  return getDemandById(demandId) || (remote ? decorateDemand(remote) : null);
}

function confirmRemoteReviewState(demandId, predicate, message) {
  return cloudApi.fetchItems("demand").then((remoteDemands) => {
    const remote = remoteDemands.find((item) => item.id === demandId);
    if (!remote || predicate(remote)) {
      return remote;
    }
    throw new Error(message);
  });
}

function clearLocalOnlyDemands() {
  const list = wx.getStorageSync(STORAGE_KEY);
  if (Array.isArray(list)) {
    saveDemands(list.filter((item) => item.remoteSynced));
  }
}

function getBootstrapDemands() {
  return getDemands().filter((item) => !item.isDeleted);
}

function getDemandBudgetSortValue(item) {
  const max = Number(item.budgetMax);
  const min = Number(item.budgetMin);
  if (Number.isFinite(max) && max > 0) {
    return max;
  }
  if (Number.isFinite(min) && min > 0) {
    return min;
  }
  return 0;
}

function getStatusText(status) {
  if (status === "following") {
    return "跟进中";
  }
  if (status === "done") {
    return "已完成";
  }
  if (status === "offline") {
    return "已下线";
  }
  return "求买";
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

function buildDemandCardTitle(item) {
  const explicitTitle = normalizeCardText(item.title);
  if (isMeaningfulCardValue(explicitTitle)) {
    return explicitTitle;
  }
  const titleParts = compactCardParts([item.brand, item.model, item.customerTag]);
  return titleParts.join(" · ") || "未命名需求";
}

function buildDemandCardSubtitle(item) {
  const titleText = [item.title, buildDemandCardTitle(item)].filter(Boolean).join(" ");
  return compactCardParts([
    item.brand,
    { label: "GPU", value: item.gpu },
    { label: "数量", value: item.quantity },
    { label: "交期", value: item.deliveryDate },
    item.remark
  ], titleText).slice(0, 4).join(" / ");
}

function buildCreatorContact(item) {
  const creator = require("./auth").getUserById(item.creatorId);
  const name = item.creatorName || (creator && creator.name) || "";
  const phone = (creator && creator.phone) || "";
  return [name, phone].filter(Boolean).join(" ");
}

function getCreatorUserForDemand(item = {}) {
  const users = authService.getUsers();
  return users.find((user) => user.id === item.creatorId)
    || users.find((user) => item.contactPhone && user.phone === item.contactPhone)
    || users.find((user) => item.creatorName && user.name === item.creatorName)
    || users.find((user) => item.contactName && user.name === item.contactName)
    || null;
}

function getReviewGroupForDemand(item = {}) {
  if (item.reviewGroup) {
    return item.reviewGroup;
  }
  const creator = getCreatorUserForDemand(item);
  return creator ? (creator.group || creator.department || "") : "";
}

function getDemandStatusClass(status) {
  if (status === "done") {
    return "status-sold";
  }
  if (status === "following") {
    return "status-following";
  }
  if (status === "offline") {
    return "status-offline";
  }
  return "status-onsale";
}

function isDemandReviewPending(item = {}) {
  if (item.status === "done" || item.status === "offline") {
    return false;
  }
  return item.offlineReviewStatus === REVIEW_STATUS.PENDING || item.completionReviewStatus === REVIEW_STATUS.PENDING;
}

function formatDemandBudget(item) {
  if (!item.budgetMin && !item.budgetMax) {
    return "面议";
  }
  return `${item.budgetMin || 0}-${item.budgetMax || 0} ${getPriceUnitLabel(item.budgetUnit)}`;
}

function decorateDemand(item) {
  const reviewPending = isDemandReviewPending(item);
  const normalized = {
    ...item,
    customerTag: item.customerTag || "老客户",
    isUrgent: !!item.isUrgent,
    budgetUnit: normalizePriceUnit(item.budgetUnit),
    businessType: normalizeBusinessType(item.businessType),
    businessTypeText: getBusinessTypeText(item.businessType),
    rentalBudgetText: buildRentalBudgetText(item),
    rentalLineText: buildRentalBudgetText(item),
    statusText: reviewPending ? "审批中" : getStatusText(item.status),
    cardStatusText: reviewPending ? "审批中" : item.status === "following" ? getStatusText(item.status) : getBusinessTypeText(item.businessType),
    cardStatusClass: reviewPending ? "status-following" : item.status === "following" ? getDemandStatusClass(item.status) : (normalizeBusinessType(item.businessType) === BUSINESS_TYPES.RENT ? "status-rent" : getDemandStatusClass(item.status)),
    followOwnerText: item.status === "following" && item.followOwnerName ? `跟进人：${item.followOwnerName}` : "",
    updatedAtText: formatDateTime(item.updatedAt),
    budgetText: formatDemandBudget(item),
    budgetSortValue: getDemandBudgetSortValue(item)
  };
  return {
    ...normalized,
    cardTitle: buildDemandCardTitle(normalized),
    cardSubtitle: buildDemandCardSubtitle(normalized),
    creatorContactText: buildCreatorContact(normalized)
  };
}

function isCompanyDemand(item) {
  return item.sourceType === "company" || item.isCompany === true;
}

function getAdminRecipientsForDemand(item) {
  const creatorGroup = getReviewGroupForDemand(item);
  return authService.getUsers().filter((user) => {
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

function canReviewDemand(user, item) {
  if (!authService.isAdminUser(user)) {
    return false;
  }
  if (authService.isSuperAdmin(user) || user.group === "管理员") {
    return true;
  }
  const creatorGroup = getReviewGroupForDemand(item);
  const approvalGroup = authService.approvalGroupForUser(user);
  return Boolean(approvalGroup && creatorGroup && approvalGroup === creatorGroup);
}

function addAdminNotice(item, type, title, summary, suffix) {
  notificationService.addNotifications(getAdminRecipientsForDemand(item).map((user) => ({
    userId: user.id,
    type,
    title,
    summary,
    itemId: item.id,
    itemType: "demand",
    matchKey: `${type}_${item.id}_${suffix || Date.now()}`
  })));
}

function getDemandBoardData({ keyword = "", status = "all", creatorId = "", urgentOnly = false, reviewPendingOnly = false, businessFilter = "all", sourceFilter = "all", currentUserId = "", includeInactive = false } = {}) {
  const normalized = keyword.trim().toLowerCase();
  const list = getDemands()
    .filter((item) => !item.isDeleted)
    .filter((item) => {
      if (reviewPendingOnly && !isDemandReviewPending(item)) {
        return false;
      }
      if (!includeInactive && !reviewPendingOnly && (item.status === "offline" || item.status === "done")) {
        return false;
      }
      if (sourceFilter === "mine" && item.creatorId !== currentUserId) {
        return false;
      }
      if (sourceFilter === "company" && !isCompanyDemand(item)) {
        return false;
      }
      if (sourceFilter === "others" && (item.creatorId === currentUserId || isCompanyDemand(item))) {
        return false;
      }      if (creatorId && item.creatorId !== creatorId) {
        return false;
      }
      if (urgentOnly && !item.isUrgent) {
        return false;
      }
      if (status !== "all" && item.status !== status) {
        return false;
      }
      if (businessFilter === "rentable" && !isRentDemand(item.businessType)) {
        return false;
      }
      if (businessFilter === "buying" && !isBuyDemand(item.businessType)) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const source = [
        item.title,
        item.customerTag,
        item.brand,
        item.model,
        item.gpu,
        item.region,
        item.contactName,
        item.contactPhone,
        getBusinessTypeText(item.businessType),
        item.rentalTerm,
        item.rentalMode,
        item.rentalBudgetMin,
        item.rentalBudgetMax,
        item.remark
      ]
        .join(" ")
        .toLowerCase();
      return source.includes(normalized);
    })
    .sort((a, b) => {
      if ((a.status === "offline") !== (b.status === "offline")) {
        return a.status === "offline" ? 1 : -1;
      }
      if (!!a.isUrgent !== !!b.isUrgent) {
        return a.isUrgent ? -1 : 1;
      }
      const budgetDiff = getDemandBudgetSortValue(b) - getDemandBudgetSortValue(a);
      if (budgetDiff !== 0) {
        return budgetDiff;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .map(decorateDemand);

  return {
    list,
    stats: {
      total: list.length,
      following: list.filter((item) => item.status === "following").length,
      done: list.filter((item) => item.status === "done").length,
      pending: list.filter((item) => item.status === "pending").length
    }
  };
}

function getDemandById(id) {
  const item = getDemands().find((entry) => entry.id === id && !entry.isDeleted);
  return item ? decorateDemand(item) : null;
}

function buildDemandDeliveryDate(formData, current = {}) {
  if (formData.deliveryDays !== undefined && formData.deliveryDays !== "") {
    const days = Math.max(Number(formData.deliveryDays) || 0, 0);
    return days > 0 ? `${days}天内` : "现货";
  }
  return formData.deliveryDate || current.deliveryDate || "";
}

function buildPayload(formData, user, current = {}) {
  const deliveryDays = formData.deliveryDays !== undefined && formData.deliveryDays !== ""
    ? Math.max(Number(formData.deliveryDays) || 0, 0)
    : current.deliveryDays;
  return {
    ...current,
    title: formData.title,
    customerTag: formData.customerTag || current.customerTag || "老客户",
    brand: formData.brand,
    model: formData.model,
    gpu: formData.gpu,
    quantity: Number(formData.quantity) || 0,
    budgetMin: formData.budgetMin,
    budgetMax: formData.budgetMax,
    budgetUnit: normalizePriceUnit(formData.budgetUnit || current.budgetUnit || PRICE_UNITS.CNY_TEN_THOUSAND),
    deliveryDays,
    deliveryDate: buildDemandDeliveryDate(formData, current),
    region: formData.region,
    contactName: formData.contactName,
    contactPhone: formData.contactPhone,
    businessType: normalizeBusinessType(formData.businessType),
    rentalTerm: formData.rentalTerm || "",
    rentalMode: formData.rentalMode || "",
    rentalBudgetMin: formData.rentalBudgetMin || "",
    rentalBudgetMax: formData.rentalBudgetMax || "",
    status: formData.status || current.status || "pending",
    isUrgent: !!formData.isUrgent,
    remark: formData.remark || "",
    usageScenario: formData.usageScenario || "",
    acceptableCondition: formData.acceptableCondition || "",
    invoiceRequired: formData.invoiceRequired || "",
    paymentTerms: formData.paymentTerms || "",
    decisionDeadline: formData.decisionDeadline || "",
    sourceType: formData.sourceType || current.sourceType || "own",
    imageUrls: Array.isArray(formData.imageUrls) ? formData.imageUrls : (current.imageUrls || []),
    mediaFiles: Array.isArray(formData.mediaFiles) ? formData.mediaFiles : (current.mediaFiles || []),
    creatorId: current.creatorId || user.id,
    creatorName: current.creatorName || user.name
  };
}

function createDemand(formData, activeUserId) {
  const list = getDemands();
  const user = authService.getUserById(activeUserId);
  const now = new Date().toISOString();
  const next = {
    id: formData.id || `dem_${Date.now()}`,
    ...buildPayload(formData, user),
    createdAt: now,
    updatedAt: now,
    isDeleted: false
  };
  list.push(next);
  saveDemands(list);
  appendDemandLog({ demandId: next.id, actionType: "新增需求", operator: user, afterStatus: next.status, remark: "创建需求信息" });
  return decorateDemand(next);
}

function upsertDemand(formData, activeUserId, demandId = "") {
  const list = getDemands();
  const user = require("./auth").getUserById(activeUserId);
  const now = new Date().toISOString();
  if (!demandId) {
    return createDemand(formData, activeUserId);
  }
  const idx = list.findIndex((item) => item.id === demandId && !item.isDeleted);
  if (idx < 0) {
    throw new Error("需求不存在");
  }
  const current = list[idx];
  if (current.offlineReviewStatus === REVIEW_STATUS.PENDING) {
    throw new Error("该条目已有下架申请待审核，请等待管理员处理");
  }
  if (current.status === "done") {
    throw new Error("该条目已完成，不能重复操作");
  }
  if (current.status === "offline" || current.offlineReviewStatus === REVIEW_STATUS.APPROVED) {
    throw new Error("该条目已下架，不能重复操作");
  }
  if (current.creatorId !== activeUserId && !authService.isAdminUser(user)) {
    throw new Error("只能修改自己创建的需求");
  }
  list[idx] = {
    ...buildPayload(formData, user, current),
    updatedAt: now
  };
  saveDemands(list);
  appendDemandLog({ demandId, actionType: "更新需求", operator: user, beforeStatus: current.status, afterStatus: list[idx].status, remark: "更新需求信息" });
  return decorateDemand(list[idx]);
}

function upsertDemandToCloud(formData, activeUserId, demandId = "") {
  const local = upsertDemand(formData, activeUserId, demandId);
  return cloudApi.saveDemand(local, activeUserId, Boolean(demandId)).then((remoteDemand) => {
    const list = getDemands();
    const index = list.findIndex((item) => item.id === local.id);
    if (index >= 0) {
      list[index] = {
        ...remoteDemand,
        ...list[index],
        imageUrls: remoteDemand.imageUrls && remoteDemand.imageUrls.length ? remoteDemand.imageUrls : list[index].imageUrls,
        mediaFiles: remoteDemand.mediaFiles && remoteDemand.mediaFiles.length ? remoteDemand.mediaFiles : list[index].mediaFiles,
        image: remoteDemand.image || list[index].image || "",
        video: remoteDemand.video || list[index].video || "",
        updatedAt: remoteDemand.updatedAt || list[index].updatedAt,
        status: list[index].status,
        remoteSynced: true
      };
      saveDemands(list);
      return decorateDemand(list[index]);
    }
    saveDemands([...list, { ...remoteDemand, remoteSynced: true }]);
    return remoteDemand;
  }).catch((error) => {
    const list = getDemands();
    const index = list.findIndex((item) => item.id === local.id);
    if (index >= 0) {
      list[index] = {
        ...list[index],
        remoteSynced: false,
        syncPending: true,
        syncError: error.message || "同步失败",
        updatedAt: new Date().toISOString()
      };
      saveDemands(list);
    }
    throw error;
  });
}

function forceDeleteDemandToCloud(demandId, activeUserId, reason = "") {
  const list = getDemands();
  const user = authService.getUserById(activeUserId);
  if (!authService.isAdminUser(user)) {
    throw new Error("仅管理员可删除需求");
  }
  const idx = list.findIndex((item) => item.id === demandId && !item.isDeleted);
  if (idx < 0) {
    throw new Error("需求不存在");
  }
  const current = list[idx];
  const now = new Date().toISOString();
  const next = {
    ...current,
    status: "offline",
    isDeleted: true,
    remoteDeleted: true,
    deletedAt: now,
    deletedBy: user.name,
    offlineReviewStatus: REVIEW_STATUS.APPROVED,
    offlineReason: String(reason || "管理员删除").trim(),
    offlineRequestedAt: current.offlineRequestedAt || now,
    offlineRequestedBy: current.offlineRequestedBy || user.id,
    offlineRequestedByName: current.offlineRequestedByName || user.name,
    offlineReviewedAt: now,
    offlineReviewedBy: user.id,
    offlineReviewedByName: user.name,
    updatedAt: now
  };
  list[idx] = next;
  saveDemands(list);
  appendDemandLog({
    demandId,
    actionType: "删除需求",
    operator: user,
    beforeStatus: current.status,
    afterStatus: "offline",
    remark: next.offlineReason
  });
  return cloudApi.saveStatus(next, activeUserId, "offline_approve", { side: "demand", reason: next.offlineReason })
    .then((res) => {
      const remote = res && (res.item || res);
      if (remote && remote.id) mergeRemoteDemands([remote]);
      return getDemandById(demandId) || decorateDemand(next);
    });
}

function updateDemandStatus(demandId, activeUserId, nextStatus) {
  const list = getDemands();
  const user = authService.getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const idx = list.findIndex((item) => item.id === demandId && !item.isDeleted);
  if (idx < 0) {
    throw new Error("需求不存在");
  }
  const current = list[idx];
  if (current.offlineReviewStatus === REVIEW_STATUS.PENDING) throw new Error("该条目已有下架申请待审核，请等待管理员处理");
  if (current.status === "done") throw new Error("该条目已完成，不能重复操作");
  if (current.status === "offline" || current.offlineReviewStatus === REVIEW_STATUS.APPROVED) throw new Error("该条目已下架，不能重复操作");
  if (nextStatus === "following" && current.status === "following" && current.followOwnerId && current.followOwnerId !== activeUserId) {
    throw new Error(`该条目已由${current.followOwnerName || "其他用户"}跟进，不能重复跟进`);
  }
  if (nextStatus !== "following" && current.creatorId !== activeUserId && !authService.isAdminUser(user)) {
    throw new Error("只能更新自己创建的需求");
  }
  list[idx] = {
    ...current,
    status: nextStatus,
    followOwnerId: nextStatus === "following" ? user.id : current.followOwnerId,
    followOwnerName: nextStatus === "following" ? user.name : current.followOwnerName,
    lastFollowedAt: nextStatus === "following" ? new Date().toISOString() : current.lastFollowedAt,
    followReminderSent: nextStatus === "following" ? false : current.followReminderSent,
    followCancelPending: false,
    updatedAt: new Date().toISOString()
  };
  saveDemands(list);
  appendDemandLog({ demandId, actionType: nextStatus === "following" ? "标记跟进中" : "更新需求状态", operator: user, beforeStatus: current.status, afterStatus: nextStatus, remark: "更新需求状态" });
  return decorateDemand(list[idx]);
}

function requestCompleteDemand(demandId, activeUserId, reason = "") {
  const list = getDemands();
  const user = authService.getUserById(activeUserId);
  if (!user) throw new Error("未找到当前用户");
  const idx = list.findIndex((item) => item.id === demandId && !item.isDeleted);
  if (idx < 0) throw new Error("需求不存在");
  const current = list[idx];
  if (current.offlineReviewStatus === REVIEW_STATUS.PENDING) throw new Error("该条目已有下架申请待审核，请等待管理员处理");
  if (current.status === "done") throw new Error("该条目已完成，不能重复操作");
  if (current.status === "offline" || current.offlineReviewStatus === REVIEW_STATUS.APPROVED) throw new Error("该条目已下架，不能重复操作");
  const now = new Date().toISOString();
  list[idx] = {
    ...current,
    status: "done",
    completionReviewStatus: REVIEW_STATUS.APPROVED,
    completionAutoApproved: true,
    completionReason: String(reason || "标记已完成").trim(),
    completionRequestedAt: now,
    completionRequestedBy: user.id,
    completionRequestedByName: user.name,
    completionReviewedAt: now,
    completionReviewedBy: user.id,
    completionReviewedByName: user.name,
    doneAt: now,
    updatedAt: now
  };
  saveDemands(list);
  appendDemandLog({ demandId, actionType: "业务完成", operator: user, beforeStatus: current.status, afterStatus: list[idx].status, remark: list[idx].completionReason });
  return decorateDemand(list[idx]);
}

function cancelFollowDemand(demandId, activeUserId) {
  const list = getDemands();
  const user = authService.getUserById(activeUserId);
  if (!user) {
    throw new Error("未找到当前用户");
  }
  const idx = list.findIndex((item) => item.id === demandId && !item.isDeleted);
  if (idx < 0) {
    throw new Error("需求不存在");
  }
  const current = list[idx];
  if (current.status !== "following") {
    throw new Error("该需求不在跟进中");
  }
  const isOwnFollow = current.followOwnerId === activeUserId;
  if (!isOwnFollow) {
    throw new Error("只能由当前跟进人取消跟进");
  }
  list[idx] = {
    ...current,
    status: "pending",
    followOwnerId: "",
    followOwnerName: "",
    lastFollowedAt: current.lastFollowedAt || "",
    followCancelPending: true,
    updatedAt: new Date().toISOString()
  };
  saveDemands(list);
  appendDemandLog({
    demandId,
    actionType: "取消跟进",
    operator: user,
    beforeStatus: current.status,
    afterStatus: "pending",
    remark: "取消跟进"
  });
  return decorateDemand(list[idx]);
}

function cancelFollowDemandToCloud(demandId, activeUserId) {
  const current = getDemandById(demandId);
  if (!current) {
    return Promise.reject(new Error("需求不存在"));
  }
  return cloudApi.saveStatus(current, activeUserId, "cancel_follow", { side: "demand" })
    .then((res) => applyRemoteDemandResult(res, demandId))
    .catch((error) => Promise.reject(buildSyncFailure("取消跟进", error)));
}

function requestOfflineDemand(demandId, activeUserId, reason = "") {
  const list = getDemands();
  const user = authService.getUserById(activeUserId);
  if (!user) throw new Error("未找到当前用户");
  const idx = list.findIndex((item) => item.id === demandId && !item.isDeleted);
  if (idx < 0) throw new Error("需求不存在");
  const current = list[idx];
  if (current.creatorId !== activeUserId && !authService.isAdminUser(user)) throw new Error("只能申请下架自己创建的需求");
  if (current.offlineReviewStatus === REVIEW_STATUS.PENDING) throw new Error("该条目已有下架申请待审核，请等待管理员处理");
  if (current.status === "done") throw new Error("该条目已完成，不能提交下架申请");
  if (current.status === "offline" || current.offlineReviewStatus === REVIEW_STATUS.APPROVED) throw new Error("该条目已下架，不能重复操作");
  const now = new Date().toISOString();
  const reviewGroup = getReviewGroupForDemand(current) || (user.group || user.department || "");
  list[idx] = { ...current, offlineReviewStatus: REVIEW_STATUS.PENDING, offlineReason: String(reason || "其他原因").trim(), offlineRequestedAt: now, offlineRequestedBy: user.id, offlineRequestedByName: user.name, reviewGroup, updatedAt: now };
  saveDemands(list);
  appendDemandLog({ demandId, actionType: "申请下架需求", operator: user, beforeStatus: current.status, afterStatus: current.status, remark: list[idx].offlineReason });
  addAdminNotice(list[idx], "demand_offline_review", "需求下架待审核", `${user.name} 申请下架 ${list[idx].title}`, "pending");
  return decorateDemand(list[idx]);
}

function requestOfflineDemandToCloud(demandId, activeUserId, reason = "") {
  const current = getDemandById(demandId);
  if (!current) {
    return Promise.reject(new Error("需求不存在"));
  }
  return cloudApi.saveStatus(current, activeUserId, "offline_request", { side: "demand", reason })
    .then((res) => applyRemoteDemandResult(res, demandId))
    .catch((error) => Promise.reject(buildSyncFailure("下线审核申请", error)));
}

function directOfflineDemand(demandId, activeUserId, reason = "") {
  const list = getDemands();
  const user = authService.getUserById(activeUserId);
  if (!user) throw new Error("未找到当前用户");
  const idx = list.findIndex((item) => item.id === demandId && !item.isDeleted);
  if (idx < 0) throw new Error("需求不存在");
  const current = list[idx];
  if (current.creatorId !== activeUserId && !authService.isAdminUser(user)) throw new Error("只能下架自己创建的需求");
  if (current.offlineReviewStatus === REVIEW_STATUS.PENDING) {
    throw new Error("该需求已在审核中，请等待审批结果");
  }
  const now = new Date().toISOString();
  list[idx] = { ...current, status: "offline", offlineReviewStatus: REVIEW_STATUS.APPROVED, offlineReason: String(reason || "客户已在别处完成采购").trim(), offlineRequestedAt: now, offlineRequestedBy: user.id, offlineRequestedByName: user.name, offlineReviewedAt: now, offlineReviewedBy: user.id, offlineReviewedByName: user.name, offlineAutoApproved: true, updatedAt: now };
  saveDemands(list);
  appendDemandLog({ demandId, actionType: "下架需求", operator: user, beforeStatus: current.status, afterStatus: "offline", remark: `直接下架：${list[idx].offlineReason}` });
  addAdminNotice(list[idx], "demand_offline_notice", "需求已下架", `${user.name} 因“${list[idx].offlineReason}”下架了 ${list[idx].title}`, "direct");
  return decorateDemand(list[idx]);
}

function updateDemandStatusToCloud(demandId, activeUserId, nextStatus) {
  const current = getDemandById(demandId);
  if (!current) {
    return Promise.reject(new Error("需求不存在"));
  }
  if (nextStatus === "done") {
    return cloudApi.saveStatus(current, activeUserId, "complete", { side: "demand", reason: "标记已完成" })
      .then((res) => applyRemoteDemandResult(res, demandId))
      .catch((error) => Promise.reject(buildSyncFailure("完成", error)));
  }
  if (nextStatus === "offline") {
    const user = authService.getUserById(activeUserId);
    const action = authService.isAdminUser(user) ? "offline_approve" : "offline_request";
    return cloudApi.saveStatus(current, activeUserId, action, { side: "demand", reason: current.offlineReason || "" })
      .then((res) => applyRemoteDemandResult(res, demandId))
      .catch((error) => Promise.reject(buildSyncFailure(action === "offline_approve" ? "下线" : "下线审核申请", error)));
  }
  return cloudApi.saveStatus(current, activeUserId, "follow", { side: "demand" })
    .then((res) => applyRemoteDemandResult(res, demandId))
    .catch((error) => Promise.reject(buildSyncFailure("跟进", error)));
}

function directOfflineDemandToCloud(demandId, activeUserId, reason = "") {
  const current = getDemandById(demandId);
  if (!current) {
    return Promise.reject(new Error("需求不存在"));
  }
  return cloudApi.saveStatus(current, activeUserId, "offline", { side: "demand", reason })
    .then((res) => {
      const remote = res && (res.item || res);
      if (remote && remote.id) {
        mergeRemoteDemands([remote]);
      }
      return getDemandById(demandId) || decorateDemand(remote);
    })
    .catch((error) => Promise.reject(buildSyncFailure("下线", error)));
}

function updateOfflineReview(demandId, activeUserId, approved) {
  const list = getDemands();
  const user = authService.getUserById(activeUserId);
  const idx = list.findIndex((item) => item.id === demandId && !item.isDeleted);
  if (idx < 0) throw new Error("需求不存在");
  const current = list[idx];
  if (!canReviewDemand(user, current)) throw new Error("只能审核自己负责分组的信息");
  if (current.offlineReviewStatus !== REVIEW_STATUS.PENDING) throw new Error("该下架申请已处理");
  const now = new Date().toISOString();
  list[idx] = { ...current, offlineReviewStatus: approved ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.REJECTED, offlineReviewedAt: now, offlineReviewedBy: user.id, offlineReviewedByName: user.name, status: approved ? "offline" : current.status, updatedAt: now };
  saveDemands(list);
  appendDemandLog({ demandId, actionType: approved ? "下架需求" : "拒绝下架需求", operator: user, beforeStatus: current.status, afterStatus: list[idx].status, remark: current.offlineReason || "" });
  return decorateDemand(list[idx]);
}

function approveOfflineRequestToCloud(demandId, activeUserId) {
  const current = getDemandById(demandId);
  if (!current) {
    return Promise.reject(new Error("需求不存在"));
  }
  return cloudApi.saveStatus(current, activeUserId, "offline_approve", { side: "demand", reason: current.offlineReason })
    .then((res) => applyRemoteDemandResult(res, demandId))
    .catch((error) => Promise.reject(buildSyncFailure("下架审批", error)));
}

function rejectOfflineRequest(demandId, activeUserId) {
  const current = getDemandById(demandId);
  if (!current) {
    return Promise.reject(new Error("需求不存在"));
  }
  return cloudApi.saveStatus(current, activeUserId, "offline_reject", { side: "demand", reason: current.offlineReason })
    .then((res) => applyRemoteDemandResult(res, demandId))
    .catch((error) => Promise.reject(buildSyncFailure("拒绝下架", error)));
}

function getAdminDashboard(adminId = "") {
  const admin = adminId ? authService.getUserById(adminId) : null;
  let list = getDemands().filter((item) => !item.isDeleted);
  let changed = false;
  list = list.map((item) => {
    if ((item.offlineReviewStatus === REVIEW_STATUS.PENDING || item.completionReviewStatus === REVIEW_STATUS.PENDING) && !item.reviewGroup) {
      const reviewGroup = getReviewGroupForDemand(item);
      if (reviewGroup) {
        changed = true;
        return { ...item, reviewGroup };
      }
    }
    return item;
  });
  if (changed) {
    saveDemands(list);
  }
  const reviewable = admin ? list.filter((item) => canReviewDemand(admin, item)) : list;
  return {
    pendingCompletionItems: [],
    pendingOfflineItems: reviewable.filter((item) => item.offlineReviewStatus === REVIEW_STATUS.PENDING).map(decorateDemand)
  };
}

function getPendingApprovalCount(adminId = "") {
  const admin = adminId ? authService.getUserById(adminId) : null;
  if (adminId && !admin) {
    return 0;
  }
  let list = getDemands().filter((item) => !item.isDeleted);
  let changed = false;
  list = list.map((item) => {
    if ((item.offlineReviewStatus === REVIEW_STATUS.PENDING || item.completionReviewStatus === REVIEW_STATUS.PENDING) && !item.reviewGroup) {
      const reviewGroup = getReviewGroupForDemand(item);
      if (reviewGroup) {
        changed = true;
        return { ...item, reviewGroup };
      }
    }
    return item;
  });
  if (changed) {
    saveDemands(list);
  }
  return list
    .filter((item) => !admin || canReviewDemand(admin, item))
    .filter((item) => item.offlineReviewStatus === REVIEW_STATUS.PENDING
      || item.completionReviewStatus === REVIEW_STATUS.PENDING)
    .length;
}

function getMyDashboard(userId) {
  const user = authService.getUserById(userId);
  const list = getDemands().filter((item) => !item.isDeleted).map(decorateDemand);
  const source = authService.isAdminUser(user) ? list : list.filter((item) => item.creatorId === userId);
  return {
    myItems: source,
    mineStats: {
      created: source.length,
      following: source.filter((item) => item.status === "following").length,
      sold: source.filter((item) => item.status === "done").length,
      offline: source.filter((item) => item.status === "offline").length
    }
  };
}
module.exports = {
  ensureSeedData,
  clearLocalOnlyDemands,
  getBootstrapDemands,
  refreshCloudDemands,
  retryPendingDemandSync,
  getDemands,
  getDemandById,
  getDemandBoardData,
  getTimeline,
  getTimelineCount,
  getAdminDashboard,
  getPendingApprovalCount,
  getMyDashboard,
  upsertDemand,
  upsertDemandToCloud,
  updateDemandStatus,
  updateDemandStatusToCloud,
  cancelFollowDemand,
  cancelFollowDemandToCloud,
  requestCompleteDemand,
  requestOfflineDemand,
  requestOfflineDemandToCloud,
  directOfflineDemandToCloud,
  forceDeleteDemandToCloud,
  approveOfflineRequestToCloud,
  rejectOfflineRequest
};
