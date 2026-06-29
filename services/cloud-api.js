const authService = require("./auth");
const {
  BUSINESS_TYPES,
  INVENTORY_STATUS,
  REVIEW_STATUS,
  SOURCE_TYPES,
  normalizePriceUnit,
  getPriceUnitLabel
} = require("../utils/constants");

// 小程序只连接新网页端 rlcgxpt.com，禁止再连接旧站。
// bootstrap 保持走后端禁用策略，避免小程序覆盖网页端数据库。
const CLOUD_SYNC_DISABLED = false;
const ORIGIN_URL = "https://rlcgxpt.com";
const BASE_URL = `${ORIGIN_URL}/api/mini/items`;
const UPLOAD_IMAGE_URL = `${ORIGIN_URL}/api/mini/upload/image`;
const UPLOAD_VIDEO_URL = `${ORIGIN_URL}/api/mini/upload/video`;
const BOOTSTRAP_URL = `${ORIGIN_URL}/api/mini/bootstrap`;
let localConfig = {};
try {
  localConfig = require("./local-config");
} catch (error) {
  localConfig = {};
}
const LEGACY_COMPAT_TOKEN = localConfig.LEGACY_COMPAT_TOKEN || "";

const SUPPLY_EXTRA_FIELDS = [
  ["ownerInfo", "货主信息"],
  ["warranty", "质保"],
  ["invoiceType", "发票"],
  ["packageStatus", "包装"],
  ["serialNumber", "SN/批次"],
  ["paymentTerms", "付款方式"],
  ["minOrderQuantity", "最小起订量"],
  ["warehouse", "仓库/提货点"],
  ["qualityReport", "检测报告"],
  ["leadTimeDays", "交期天数"]
];

const DEMAND_EXTRA_FIELDS = [
  ["deliveryDays", "期望交期天数"],
  ["region", "地区"],
  ["usageScenario", "使用场景"],
  ["acceptableCondition", "可接受成色"],
  ["invoiceRequired", "发票要求"],
  ["paymentTerms", "付款方式"],
  ["decisionDeadline", "决策期限"]
];

function request({ url = BASE_URL, method = "GET", data = null }) {
  if (CLOUD_SYNC_DISABLED || !url) {
    return Promise.reject(new Error("云端同步已临时断开，避免污染旧站数据"));
  }
  const miniSessionToken = authService.getMiniSessionToken();
  const headers = {
    "content-type": "application/json"
  };
  if (miniSessionToken) {
    headers.Authorization = `Bearer ${miniSessionToken}`;
  } else if (LEGACY_COMPAT_TOKEN) {
    headers["x-juzhen-token"] = LEGACY_COMPAT_TOKEN;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      timeout: 5000,
      header: headers,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {});
          return;
        }
        if (res.statusCode === 401 || res.statusCode === 403) {
          authService.clearSession();
          reject(new Error((res.data && res.data.error) || "云端身份校验失败，请稍后重试"));
          return;
        }
        reject(new Error((res.data && res.data.error) || `云端接口异常：${res.statusCode}`));
      },
      fail: (error) => reject(new Error((error.errMsg && error.errMsg.includes("timeout")) ? "云端接口请求超时，请稍后重试" : (error.errMsg || "云端接口请求失败")))
    });
  });
}

function getUserByContact(name, phone) {
  const users = authService.getUsers();
  return users.find((item) => item.name === name && item.phone === phone)
    || users.find((item) => item.name === name)
    || null;
}

function getCurrentActor(activeUserId) {
  const user = authService.getUserById(activeUserId) || authService.getCurrentUser() || {};
  return {
    name: user.name || "微信小程序",
    phone: user.phone || "",
    id: user.id || activeUserId || ""
  };
}

function getItemOwnerContact(item = {}, activeUserId = "") {
  const creator = authService.getUserById(item.creatorId) || {};
  const actor = getCurrentActor(activeUserId);
  return {
    name: item.creatorName || creator.name || item.contactName || actor.name,
    phone: item.contactMethod || creator.phone || actor.phone
  };
}

function getDemandOwnerContact(item = {}, activeUserId = "") {
  const creator = authService.getUserById(item.creatorId) || {};
  const actor = getCurrentActor(activeUserId);
  return {
    name: item.creatorName || creator.name || item.contactName || actor.name,
    phone: item.contactPhone || creator.phone || actor.phone
  };
}

function mimeFromPath(path = "") {
  const lower = String(path).toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function isRemoteUrl(path = "") {
  return /^https?:\/\//i.test(String(path || "").trim());
}

function normalizeRemoteUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (/^https?:\/\//i.test(text)) {
    return text;
  }
  if (text.startsWith("//")) {
    return `https:${text}`;
  }
  if (text.startsWith("/")) {
    return `${ORIGIN_URL}${text}`;
  }
  return "";
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (res) => resolve(res.data),
      fail: (error) => reject(new Error(error.errMsg || "读取图片失败"))
    });
  });
}

function uploadMedia(filePath, url) {
  if (!filePath || isRemoteUrl(filePath)) {
    return Promise.resolve(filePath || "");
  }
  const mimeType = mimeFromPath(filePath);
  return readFileBase64(filePath)
    .then((base64) => request({
      url,
      method: "POST",
      data: {
        mimeType,
        data: `data:${mimeType};base64,${base64}`
      }
    }))
    .then((res) => res.url || "");
}

function uploadImage(filePath) {
  return uploadMedia(filePath, UPLOAD_IMAGE_URL);
}

function uploadVideo(filePath) {
  return uploadMedia(filePath, UPLOAD_VIDEO_URL);
}

function uploadImages(item) {
  const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  if (!imageUrls.length) {
    return Promise.resolve(item);
  }
  return Promise.all(imageUrls.slice(0, 6).map(uploadImage)).then((urls) => {
    const uploaded = urls.filter(isRemoteUrl);
    const mediaFiles = Array.isArray(item.mediaFiles) ? item.mediaFiles : [];
    return {
      ...item,
      image: uploaded[0] || item.image || "",
      imageUrls: uploaded,
      mediaFiles: mediaFiles.map((file) => {
        if (typeof file === "string") {
          const index = imageUrls.indexOf(file);
          return index >= 0 && isRemoteUrl(urls[index]) ? urls[index] : file;
        }
        const fileUrl = file && (file.url || file.tempFilePath);
        const index = imageUrls.indexOf(fileUrl);
        return index >= 0 && isRemoteUrl(urls[index]) ? { ...file, url: urls[index], tempFilePath: "" } : file;
      })
    };
  });
}

function firstVideoPath(item = {}) {
  const mediaFiles = Array.isArray(item.mediaFiles) ? item.mediaFiles : [];
  const video = mediaFiles.find((file) => {
    if (typeof file === "string") return /\.(mp4|mov|webm)$/i.test(file);
    return file && (file.type === "video" || /\.(mp4|mov|webm)$/i.test(file.url || file.tempFilePath || ""));
  });
  if (!video) return item.video || "";
  return typeof video === "string" ? video : (video.url || video.tempFilePath || "");
}

function uploadVideos(item) {
  const mediaFiles = Array.isArray(item.mediaFiles) ? item.mediaFiles : [];
  const videoFiles = mediaFiles.filter((file) => {
    if (typeof file === "string") return /\.(mp4|mov|webm)$/i.test(file);
    return file && (file.type === "video" || /\.(mp4|mov|webm)$/i.test(file.url || file.tempFilePath || ""));
  });
  const videoPaths = videoFiles.map((file) => typeof file === "string" ? file : (file.url || file.tempFilePath)).filter(Boolean);
  if (item.video && !videoPaths.includes(item.video)) {
    videoPaths.unshift(item.video);
  }
  if (!videoPaths.length) {
    return Promise.resolve(item);
  }
  return Promise.all(videoPaths.slice(0, 6).map(uploadVideo)).then((urls) => {
    const uploaded = urls.filter(isRemoteUrl);
    if (!uploaded.length) return item;
    return {
      ...item,
      video: uploaded[0] || "",
      mediaFiles: mediaFiles.map((file) => {
        if (typeof file === "string") {
          const index = videoPaths.indexOf(file);
          return index >= 0 && isRemoteUrl(urls[index]) ? urls[index] : file;
        }
        const fileUrl = file && (file.url || file.tempFilePath);
        const index = videoPaths.indexOf(fileUrl);
        return index >= 0 && isRemoteUrl(urls[index]) ? { ...file, url: urls[index], tempFilePath: "" } : file;
      })
    };
  });
}

function uploadMediaFields(item) {
  return uploadImages(item).then(uploadVideos);
}

function parseExtraFields(note = "", definitions = []) {
  const result = {};
  const lines = String(note || "").split(/\r?\n/);
  definitions.forEach(([key, label]) => {
    const found = lines.find((line) => line.trim().startsWith(`${label}：`) || line.trim().startsWith(`${label}:`));
    if (found) {
      result[key] = found.replace(new RegExp(`^\\s*${label}[：:]\\s*`), "").trim();
    }
  });
  return result;
}

function stripExtraFields(note = "", definitions = []) {
  return String(note || "")
    .split(/\r?\n/)
    .filter((line) => !definitions.some(([, label]) => line.trim().startsWith(`${label}：`) || line.trim().startsWith(`${label}:`)))
    .join("\n")
    .trim();
}

function buildNoteWithExtras(remark = "", item = {}, definitions = []) {
  const lines = [String(remark || "").trim()].filter(Boolean);
  definitions.forEach(([key, label]) => {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      lines.push(`${label}：${value}`);
    }
  });
  return lines.join("\n");
}

function parseDays(value = "") {
  const text = String(value || "").trim();
  if (!text || text === "现货") return 0;
  const match = text.match(/\d+/);
  return match ? Number(match[0]) || 0 : 0;
}

function appendRemoteMedia(files, value, type) {
  if (!value) {
    return;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
      try {
        appendRemoteMedia(files, JSON.parse(text), type);
        return;
      } catch (error) {
      }
    }
    if (text.includes(",") || text.includes("\n")) {
      text.split(/[,\n]/).forEach((entry) => appendRemoteMedia(files, entry, type));
      return;
    }
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => appendRemoteMedia(files, entry, type));
    return;
  }
  if (typeof value === "object") {
    const url = value.url || value.src || value.path || value.fileUrl || value.filePath || value.image || value.video || value.tempFilePath;
    appendRemoteMedia(files, url, value.type || value.fileType || value.mediaType || type);
    return;
  }
  const url = normalizeRemoteUrl(value);
  if (url && !files.find((file) => file.url === url)) {
    const inferredType = /\.(mp4|mov|webm)(\?|#|$)/i.test(url) ? "video" : (String(type || "").toLowerCase().includes("video") ? "video" : "image");
    files.push({ type: inferredType, url });
  }
}

function buildMediaFiles(item = {}) {
  const files = [];
  appendRemoteMedia(files, item.image || item.imageUrl || item.cover || item.thumbnail, "image");
  appendRemoteMedia(files, item.imageUrls || item.images || item.pictures || item.photos, "image");
  appendRemoteMedia(files, item.video, "video");
  appendRemoteMedia(files, item.videoUrls || item.videos, "video");
  appendRemoteMedia(files, item.mediaFiles || item.media || item.files || item.attachments, "image");
  return files;
}

function normalizeBusinessTypeFromPricing(pricing = {}) {
  if (pricing.saleEnabled && pricing.rentalEnabled) {
    return BUSINESS_TYPES.BOTH;
  }
  if (pricing.rentalEnabled) {
    return BUSINESS_TYPES.RENT;
  }
  return BUSINESS_TYPES.SALE;
}

function normalizeRemoteCategory(category = "") {
  const value = String(category || "");
  if (value.includes("整机") || value.includes("服务器")) return "整机服务器";
  if (value.includes("CPU") || value.includes("cpu")) return "CPU";
  if (value.includes("网卡")) return "网卡";
  if (value.includes("模组")) return "模组";
  if (value.includes("机头")) return "机头";
  if (value.includes("内存")) return "内存";
  if (value.includes("SSD") || value.includes("固态")) return "SSD固态";
  if (value.includes("机械盘") || value.includes("企业盘") || value.includes("机械")) return "企业机械盘";
  if (/gpu/i.test(value)) return "GPU";
  if (/cpu/i.test(value)) return "CPU";
  return value || "其他";
}

function rentalPricesFromPricing(pricing = {}) {
  const quotes = pricing.rentalQuotes || {};
  return {
    oneYearFull: quotes.oneYearFull || "",
    twoYearFull: quotes.twoYearFull || "",
    threeYearFull: quotes.threeYearFull || "",
    oneYearMove: quotes.oneYearMove || "",
    twoYearMove: quotes.twoYearMove || "",
    threeYearMove: quotes.threeYearMove || ""
  };
}

function pricingFromSupply(item = {}) {
  const businessType = item.businessType || BUSINESS_TYPES.SALE;
  return {
    saleEnabled: businessType === BUSINESS_TYPES.SALE || businessType === BUSINESS_TYPES.BOTH,
    salePrice: item.price || "",
    saleUnit: getPriceUnitLabel(item.priceUnit),
    rentalEnabled: businessType === BUSINESS_TYPES.RENT || businessType === BUSINESS_TYPES.BOTH,
    rentalQuotes: item.rentalPrices || {},
    legacyPrice: item.price || ""
  };
}

function pricingFromDemand(item = {}) {
  const businessType = item.businessType || BUSINESS_TYPES.SALE;
  return {
    saleEnabled: businessType === BUSINESS_TYPES.SALE || businessType === BUSINESS_TYPES.BOTH,
    salePrice: item.budgetMax || item.budgetMin || "",
    saleUnit: getPriceUnitLabel(item.budgetUnit),
    rentalEnabled: businessType === BUSINESS_TYPES.RENT || businessType === BUSINESS_TYPES.BOTH,
    rentalQuotes: {
      oneYearFull: item.rentalBudgetMax || item.rentalBudgetMin || "",
      twoYearFull: "",
      threeYearFull: "",
      oneYearMove: "",
      twoYearMove: "",
      threeYearMove: ""
    },
    legacyPrice: item.budgetMax || item.budgetMin || ""
  };
}

function normalizeRemoteSupplyStatus(item = {}) {
  if (item.deleted || item.status === INVENTORY_STATUS.OFFLINE || item.status === "offline" || item.status === "closed") {
    return INVENTORY_STATUS.OFFLINE;
  }
  if (item.status === INVENTORY_STATUS.SOLD || item.status === "sold" || item.status === "done") {
    return INVENTORY_STATUS.SOLD;
  }
  if (item.status === INVENTORY_STATUS.FOLLOWING || item.status === "following") {
    return INVENTORY_STATUS.FOLLOWING;
  }
  return INVENTORY_STATUS.ON_SALE;
}

function normalizeRemoteDemandStatus(item = {}) {
  if (item.deleted || item.status === "offline" || item.status === "closed") {
    return "offline";
  }
  if (item.status === "done" || item.status === "sold") {
    return "done";
  }
  if (item.status === "following") {
    return "following";
  }
  return "pending";
}

function getRemoteImageUrls(item = {}) {
  const urls = [];
  if (item.image && isRemoteUrl(item.image)) {
    urls.push(item.image);
  }
  (Array.isArray(item.imageUrls) ? item.imageUrls : []).forEach((url) => {
    if (isRemoteUrl(url) && !urls.includes(url)) {
      urls.push(url);
    }
  });
  return urls.slice(0, 6);
}

function getRemoteVideoUrls(item = {}) {
  const urls = [];
  if (item.video && isRemoteUrl(item.video)) {
    urls.push(item.video);
  }
  (Array.isArray(item.mediaFiles) ? item.mediaFiles : []).forEach((file) => {
    const url = typeof file === "string" ? file : (file && file.url);
    const type = typeof file === "string" ? "" : (file && file.type);
    if (url && isRemoteUrl(url) && (type === "video" || /\.(mp4|mov|webm)(\?|#|$)/i.test(url)) && !urls.includes(url)) {
      urls.push(url);
    }
  });
  return urls.slice(0, 6);
}

function getRemoteMediaFiles(item = {}) {
  const files = [];
  getRemoteImageUrls(item).forEach((url) => files.push({ type: "image", url }));
  getRemoteVideoUrls(item).forEach((url) => files.push({ type: "video", url }));
  return files.slice(0, 12);
}

function mapRemoteSupply(item) {
  const owner = getUserByContact(item.ownerName || item.person || "", "");
  const pricing = item.pricing || {};
  const businessType = normalizeBusinessTypeFromPricing(pricing);
  const machineConfig = item.machineConfig || {};
  const creatorName = item.person || item.ownerName || "网页端";
  const extras = parseExtraFields(item.note || "", SUPPLY_EXTRA_FIELDS);
  const ownerInfo = item.ownerInfo || item.cargoOwnerInfo || extras.ownerInfo || "";
  const leadTimeDays = Number(extras.leadTimeDays) || parseDays(item.deliveryDate || item.arrivalDate);
  const cleanNote = stripExtraFields(item.note || "", SUPPLY_EXTRA_FIELDS);
  const mediaFiles = buildMediaFiles(item);
  const imageUrls = mediaFiles.filter((file) => file.type !== "video").map((file) => file.url);
  return {
    id: item.id,
    remoteSynced: true,
    title: item.title || item.summaryTitle || "未命名货源",
    displayTitle: item.title || item.summaryTitle || "未命名货源",
    category: item.category || "其他",
    condition: item.condition === "未标注" || item.condition === "未标记" ? "" : (item.condition || ""),
    stockStatus: leadTimeDays > 0 ? "准现货" : "现货",
    leadTimeDays,
    businessType,
    rentalPrices: rentalPricesFromPricing(pricing),
    brand: machineConfig.brand || "",
    model: machineConfig.model || item.title || "",
    cpu: machineConfig.cpu || "",
    memory: machineConfig.memory || "",
    storage: machineConfig.dataDisk || machineConfig.diskCapacity || "",
    gpu: machineConfig.gpu || "",
    nic: [machineConfig.nic1, machineConfig.nic2, machineConfig.nic3, machineConfig.nic4].filter(Boolean).join(" / "),
    nic2: machineConfig.nic2 || "",
    nic3: machineConfig.nic3 || "",
    nic4: machineConfig.nic4 || "",
    extraNics: machineConfig.extraNics || "",
    specDetails: {
      brand: machineConfig.brand || "",
      model: machineConfig.model || item.title || "",
      cpu: machineConfig.cpu || "",
      memory: machineConfig.memory || "",
      storage: machineConfig.dataDisk || "",
      m2: machineConfig.systemDisk || "",
      gpu: machineConfig.gpu || "",
      nic: machineConfig.nic1 || "",
      nic2: machineConfig.nic2 || "",
      nic3: machineConfig.nic3 || "",
      nic4: machineConfig.nic4 || "",
      extraNics: machineConfig.extraNics || "",
      raid: machineConfig.raid || "",
      powerSupply: machineConfig.psu || "",
      pcieSwitch: machineConfig.pcieSwitch || ""
    },
    quantity: Number(item.quantity) || 0,
    price: pricing.salePrice || item.price || "",
    priceUnit: normalizePriceUnit(pricing.saleUnit || item.priceUnit),
    location: "",
    arrivalDate: leadTimeDays > 0 ? `${leadTimeDays}天` : "现货",
    deliveryDate: leadTimeDays > 0 ? `${leadTimeDays}天` : "现货",
    sourceType: item.scope === "company" ? SOURCE_TYPES.COMPANY : (item.scope === "shared" ? SOURCE_TYPES.SHARED : SOURCE_TYPES.OWN),
    contactName: item.ownerName || item.person || "",
    contactMethod: "",
    customerTag: item.customer || "老客户",
    ownerInfo,
    imageUrls,
    mediaFiles,
    isUrgent: !!item.urgent,
    remark: cleanNote,
    warranty: extras.warranty || "",
    invoiceType: extras.invoiceType || "",
    packageStatus: extras.packageStatus || "",
    serialNumber: extras.serialNumber || "",
    paymentTerms: extras.paymentTerms || "",
    minOrderQuantity: Number(extras.minOrderQuantity) || 0,
    warehouse: extras.warehouse || "",
    qualityReport: extras.qualityReport || "",
    status: normalizeRemoteSupplyStatus(item),
    followOwnerId: item.followOwnerId || "",
    followOwnerName: item.followOwnerName || "",
    lastFollowedAt: item.lastFollowedAt || "",
    followReminderSent: !!item.followReminderSent,
    reviewStatus: item.reviewStatus || REVIEW_STATUS.AUTO,
    reviewReason: item.reviewReason || "网页端同步",
    reviewGroup: item.reviewGroup || "",
    offlineReviewStatus: item.offlineReviewStatus || "",
    offlineReason: item.offlineReason || item.reason || "",
    offlineReviewedAt: item.offlineReviewedAt || "",
    completionReviewStatus: item.completionReviewStatus || "",
    completionReason: item.completionReason || item.reason || "",
    completionReviewedAt: item.completionReviewedAt || "",
    soldAt: item.soldAt || "",
    reviewAt: item.updatedAt || item.createdAt || "",
    creatorId: owner ? owner.id : `remote_${creatorName}`,
    creatorName,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    isDeleted: false,
    remoteDeleted: !!item.deleted,
    deletedAt: item.deletedAt || "",
    displayTags: []
  };
}

function mapRemoteDemand(item) {
  const owner = getUserByContact(item.person || item.ownerName || "", item.phone || "");
  const pricing = item.pricing || {};
  const businessType = normalizeBusinessTypeFromPricing(pricing);
  const budget = pricing.salePrice || item.price || "";
  const creatorName = item.person || item.ownerName || "网页端";
  const machineConfig = item.machineConfig || {};
  const extras = parseExtraFields(item.note || "", DEMAND_EXTRA_FIELDS);
  const cleanNote = stripExtraFields(item.note || "", DEMAND_EXTRA_FIELDS);
  const deliveryDays = extras.deliveryDays !== undefined ? Number(extras.deliveryDays) || 0 : parseDays(item.deliveryDate);
  const mediaFiles = buildMediaFiles(item);
  const imageUrls = mediaFiles.filter((file) => file.type !== "video").map((file) => file.url);
  return {
    id: item.id,
    remoteSynced: true,
    title: item.title || item.summaryTitle || "未命名需求",
    customerTag: item.customer || "老客户",
    brand: machineConfig.brand || (item.category && item.category !== "其他" ? item.category : ""),
    model: machineConfig.model || item.title || "",
    gpu: machineConfig.gpu || "",
    quantity: Number(item.quantity) || 0,
    budgetMin: budget,
    budgetMax: budget,
    budgetUnit: normalizePriceUnit(pricing.saleUnit || item.budgetUnit),
    deliveryDays,
    deliveryDate: deliveryDays > 0 ? `${deliveryDays}天内` : (item.deliveryDate || ""),
    region: extras.region || "",
    contactName: item.person || "",
    contactPhone: item.phone || "",
    businessType,
    rentalTerm: "一年",
    rentalMode: "全包",
    rentalBudgetMin: pricing.rentalQuotes && pricing.rentalQuotes.oneYearFull || "",
    rentalBudgetMax: pricing.rentalQuotes && pricing.rentalQuotes.oneYearFull || "",
    status: normalizeRemoteDemandStatus(item),
    followOwnerId: item.followOwnerId || "",
    followOwnerName: item.followOwnerName || "",
    lastFollowedAt: item.lastFollowedAt || "",
    followReminderSent: !!item.followReminderSent,
    offlineReviewStatus: item.offlineReviewStatus || "",
    offlineReason: item.offlineReason || item.reason || "",
    offlineReviewedAt: item.offlineReviewedAt || "",
    completionReviewStatus: item.completionReviewStatus || "",
    completionReason: item.completionReason || item.reason || "",
    completionReviewedAt: item.completionReviewedAt || "",
    doneAt: item.doneAt || "",
    isUrgent: !!item.urgent,
    remark: cleanNote,
    usageScenario: extras.usageScenario || "",
    acceptableCondition: extras.acceptableCondition || "",
    invoiceRequired: extras.invoiceRequired || "",
    paymentTerms: extras.paymentTerms || "",
    decisionDeadline: extras.decisionDeadline || "",
    sourceType: item.scope === "company" ? "company" : (item.scope === "shared" ? "shared" : "own"),
    imageUrls,
    mediaFiles,
    creatorId: owner ? owner.id : `remote_${creatorName}`,
    creatorName,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    isDeleted: false,
    remoteDeleted: !!item.deleted,
    deletedAt: item.deletedAt || ""
  };
}

function toRemoteSupply(item, activeUserId) {
  const owner = getItemOwnerContact(item, activeUserId);
  const spec = item.specDetails || {};
  return {
    id: item.id,
    side: "supply",
    status: item.status || INVENTORY_STATUS.ON_SALE,
    category: normalizeRemoteCategory(item.category),
    condition: item.condition === "未标注" || item.condition === "未标记" ? "" : (item.condition || ""),
    title: item.title || item.displayTitle || "未命名货源",
    quantity: String(item.quantity || ""),
    pricing: pricingFromSupply(item),
    person: owner.name,
    phone: owner.phone,
    customer: item.customerTag === "新客户" ? "新客户" : "老客户",
    ownerInfo: item.ownerInfo || "",
    urgent: !!item.isUrgent,
    note: buildNoteWithExtras(item.remark || "", item, SUPPLY_EXTRA_FIELDS),
    image: getRemoteImageUrls(item)[0] || "",
    imageUrls: getRemoteImageUrls(item),
    images: getRemoteImageUrls(item),
    video: getRemoteVideoUrls(item)[0] || "",
    videoUrls: getRemoteVideoUrls(item),
    mediaFiles: getRemoteMediaFiles(item),
    scope: item.sourceType === SOURCE_TYPES.COMPANY ? "company" : (item.sourceType === SOURCE_TYPES.SHARED ? "shared" : "mine"),
    ownerName: owner.name,
    followOwnerId: item.followOwnerId || "",
    followOwnerName: item.followOwnerName || "",
    lastFollowedAt: item.lastFollowedAt || "",
    followReminderSent: !!item.followReminderSent,
    reviewStatus: item.reviewStatus || "",
    reviewReason: item.reviewReason || "",
    reviewGroup: item.reviewGroup || "",
    offlineReviewStatus: item.offlineReviewStatus || "",
    completionReviewStatus: item.completionReviewStatus || "",
    machineConfig: {
      gpu: spec.gpu || item.gpu || "",
      cpu: spec.cpu || item.cpu || "",
      memory: spec.memory || item.memory || "",
      systemDisk: spec.m2 || item.m2 || "",
      dataDisk: spec.storage || spec.diskCapacity || item.storage || "",
      nic1: spec.nic || item.nic || "",
      nic2: spec.nic2 || item.nic2 || "",
      nic3: spec.nic3 || item.nic3 || "",
      nic4: spec.nic4 || item.nic4 || "",
      extraNics: spec.extraNics || item.extraNics || "",
      raid: spec.raid || item.raid || "",
      psu: spec.powerSupply || item.powerSupply || "",
      pcieSwitch: spec.pcieSwitch || item.pcieSwitch || ""
    }
  };
}

function toRemoteDemand(item, activeUserId) {
  const owner = getDemandOwnerContact(item, activeUserId);
  return {
    id: item.id,
    side: "demand",
    status: item.status || "pending",
    category: normalizeRemoteCategory(item.brand || "其他"),
    condition: "",
    title: item.title || item.model || "未命名需求",
    quantity: String(item.quantity || ""),
    pricing: pricingFromDemand(item),
    person: owner.name,
    phone: owner.phone,
    customer: item.customerTag === "新客户" ? "新客户" : "老客户",
    ownerInfo: [owner.name, owner.phone].filter(Boolean).join(" "),
    urgent: !!item.isUrgent,
    summaryTitle: item.title || item.model || "未命名需求",
    deliveryDate: item.deliveryDate || "",
    note: buildNoteWithExtras(item.remark || "", item, DEMAND_EXTRA_FIELDS),
    image: getRemoteImageUrls(item)[0] || "",
    imageUrls: getRemoteImageUrls(item),
    images: getRemoteImageUrls(item),
    video: getRemoteVideoUrls(item)[0] || "",
    videoUrls: getRemoteVideoUrls(item),
    mediaFiles: getRemoteMediaFiles(item),
    scope: item.sourceType === "shared" ? "shared" : (item.sourceType === "own" ? "mine" : "company"),
    ownerName: owner.name,
    followOwnerId: item.followOwnerId || "",
    followOwnerName: item.followOwnerName || "",
    lastFollowedAt: item.lastFollowedAt || "",
    followReminderSent: !!item.followReminderSent,
    machineConfig: {
      brand: item.brand || "",
      model: item.model || "",
      gpu: item.gpu || ""
    }
  };
}

function fetchItems(side) {
  const actor = getCurrentActor();
  const params = [
    `side=${encodeURIComponent(side)}`,
    "includeDeleted=1",
    actor.phone ? `operatorPhone=${encodeURIComponent(actor.phone)}` : ""
  ].filter(Boolean).join("&");
  return request({ url: `${BASE_URL}?${params}` })
    .then((res) => (res.items || []).map(side === "demand" ? mapRemoteDemand : mapRemoteSupply));
}

function saveSupply(item, activeUserId, isEdit) {
  return uploadMediaFields(item).then((readyItem) => {
    const payload = toRemoteSupply(readyItem, activeUserId);
    const url = isEdit ? `${BASE_URL}/${encodeURIComponent(item.id)}` : BASE_URL;
    return request({ url, method: isEdit ? "PUT" : "POST", data: payload })
      .then((res) => res.item ? mapRemoteSupply(res.item) : readyItem);
  });
}

function saveDemand(item, activeUserId, isEdit) {
  return uploadMediaFields(item).then((readyItem) => {
    const payload = toRemoteDemand(readyItem, activeUserId);
    const url = isEdit ? `${BASE_URL}/${encodeURIComponent(item.id)}` : BASE_URL;
    return request({ url, method: isEdit ? "PUT" : "POST", data: payload })
      .then((res) => res.item ? mapRemoteDemand(res.item) : readyItem);
  });
}

function deleteItem(id) {
  return Promise.reject(new Error("直接删除已禁用，请使用状态接口提交下架或自动下架原因"));
}

function saveStatus(item, activeUserId, action, extra = {}) {
  const side = extra.side || "supply";
  const actionMap = {
    offline_request: "offline"
  };
  const remoteAction = actionMap[action] || action;
  const actor = getCurrentActor(activeUserId);
  if (!actor.phone) {
    return Promise.reject(new Error("当前登录账号缺少手机号，请退出后重新登录"));
  }
  return request({
    url: `${BASE_URL}/${encodeURIComponent(item.id)}/status`,
    method: "POST",
    data: {
      id: item.id,
      side,
      action: remoteAction,
      reason: extra.reason || item.offlineReason || item.completionReason || "",
      operatorPhone: actor.phone
    }
  });
}

function bootstrapFromMini(supplies = [], demands = [], activeUserId = "") {
  // 联调新网页端时，不允许小程序把本地旧数据作为 source-of-truth 覆盖网页端库。
  // 数据同步只通过 fetch/create/update/status/delete 增量接口进行。
  return Promise.resolve({ skipped: true, disabled: true, reason: "bootstrap disabled on mini client" });
}

module.exports = {
  fetchItems,
  saveSupply,
  saveDemand,
  saveStatus,
  deleteItem,
  bootstrapFromMini
};


