const app = getApp();
const inventoryService = require("../../services/inventory");
const demandService = require("../../services/demand");

const SUPPLY_ALIASES = {
  title: ["货源标题", "标题", "名称"],
  category: ["品类", "类别"],
  condition: ["成色"],
  stockStatus: ["状态", "库存状态"],
  leadTimeDays: ["交期", "交期天数", "交期（天）"],
  brand: ["品牌"],
  model: ["型号", "型号规格"],
  quantity: ["数量"],
  price: ["价格", "报价", "单价", "出售价格", "销售价"],
  location: ["地区", "地点"],
  contactName: ["联系人", "对接人"],
  contactMethod: ["电话/微信", "联系方式", "电话", "微信"],
  customerTag: ["客户标签", "新老客户"],
  isUrgent: ["紧急", "是否紧急"],
  remark: ["备注"],
  usageScenario: ["场景", "使用场景"],
  acceptableCondition: ["成色要求", "可接受成色"],
  invoiceRequired: ["发票", "发票要求"],
  paymentTerms: ["付款", "付款方式"],
  decisionDeadline: ["决策期限", "截止时间"],
  cpu: ["CPU", "cpu"],
  memory: ["内存", "显存"],
  storage: ["硬盘", "存储", "数据盘", "系统盘"],
  gpu: ["GPU", "gpu"],
  nic: ["网卡"],
  warranty: ["质保", "保修"],
  invoiceType: ["发票", "票据"],
  packageStatus: ["包装", "包装状态"],
  serialNumber: ["SN", "序列号", "批次"],
  paymentTerms: ["付款", "付款方式"],
  warehouse: ["仓库", "提货点"],
  qualityReport: ["检测", "检测报告"]
};

const DEMAND_ALIASES = {
  title: ["需求标题", "标题", "名称"],
  customerTag: ["客户标签", "新老客户"],
  brand: ["品牌"],
  model: ["型号", "型号规格"],
  gpu: ["GPU需求", "GPU", "gpu"],
  quantity: ["数量"],
  budgetMin: ["预算下限", "最低预算"],
  budgetMax: ["预算上限", "最高预算", "预算", "价格", "报价"],
  deliveryDate: ["期望交期", "交期"],
  region: ["地区", "地点"],
  contactName: ["对接人", "联系人"],
  contactPhone: ["电话/微信", "联系方式", "电话", "微信"],
  isUrgent: ["紧急", "是否紧急"],
  remark: ["备注"],
  usageScenario: ["场景", "使用场景"],
  acceptableCondition: ["成色要求", "可接受成色"],
  invoiceRequired: ["发票", "发票要求"],
  paymentTerms: ["付款", "付款方式"],
  decisionDeadline: ["决策期限", "截止时间"]
};

const DEFAULT_SUPPLY = {
  title: "",
  category: "整机服务器",
  condition: "",
  stockStatus: "现货",
  leadTimeDays: 0,
  brand: "",
  model: "",
  quantity: 1,
  price: "",
  location: "深圳",
  contactName: "",
  contactMethod: "",
  customerTag: "老客户",
  imageUrls: [],
  isUrgent: false,
  remark: "",
  sourceType: "own",
  marketType: "domestic",
  displayVisible: true
};

const DEFAULT_DEMAND = {
  title: "",
  customerTag: "老客户",
  brand: "",
  model: "",
  gpu: "无",
  quantity: 1,
  budgetMin: "",
  budgetMax: "",
  deliveryDate: "3天内",
  region: "深圳",
  contactName: "",
  contactPhone: "",
  status: "pending",
  isUrgent: false,
  remark: ""
};

function splitLine(line, delimiter) {
  if (delimiter !== ",") {
    return line.split(delimiter).map((item) => item.trim());
  }
  const result = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === "," && !inQuote) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  if (firstLine.includes("\t")) {
    return "\t";
  }
  return ",";
}

function parseTableText(text) {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    return [];
  }
  const delimiter = detectDelimiter(normalized);
  return normalized
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => splitLine(line, delimiter));
}

function buildHeaderMap(headers, aliases) {
  const normalizedHeaders = headers.map((item) => String(item || "").trim());
  return Object.keys(aliases).reduce((map, field) => {
    const index = normalizedHeaders.findIndex((header) => aliases[field].includes(header));
    if (index >= 0) {
      map[field] = index;
    }
    return map;
  }, {});
}

function parseBoolean(value) {
  const text = String(value || "").trim();
  return ["是", "紧急", "急", "1", "true", "TRUE", "Y", "y"].includes(text);
}

function normalizeCustomerTag(value) {
  const text = String(value || "").trim();
  return text.includes("新") ? "新客户" : "老客户";
}

function parseLooseKeyValues(text) {
  const result = {};
  String(text || "").split(/[\n,，;；]/).forEach((part) => {
    const pieces = part.split(/[:：=]/);
    if (pieces.length >= 2) {
      result[pieces[0].trim()] = pieces.slice(1).join(":").trim();
    }
  });
  return result;
}

function applyLooseConfig(row, aliases) {
  const text = Object.values(row || {}).join(" ");
  const kv = parseLooseKeyValues(text);
  Object.keys(aliases).forEach((field) => {
    if (row[field]) return;
    const key = Object.keys(kv).find((name) => aliases[field].includes(name));
    if (key) row[field] = kv[key];
  });
  if (!row.cpu) row.cpu = pickMatch(text, [/(?:CPU|处理器)[:：\s]*([^,，;；\/]{2,30})/i]);
  if (!row.memory) row.memory = pickMatch(text, [/(?:内存|RAM)[:：\s]*([^,，;；\/]{2,24})/i, /(\d+\s*(?:G|GB|T|TB)\s*(?:DDR4|DDR5)?)/i]);
  if (!row.storage) row.storage = pickMatch(text, [/(?:硬盘|存储|数据盘)[:：\s]*([^,，;；\/]{2,30})/i]);
  if (!row.gpu) row.gpu = pickMatch(text, [/(?:GPU|显卡)[:：\s]*([^,，;；\/]{1,24})/i, /(\d+\s*卡)/]);
  if (!row.nic) row.nic = pickMatch(text, [/(?:网卡|NIC)[:：\s]*([^,，;；\/]{2,24})/i]);
  if (!row.brand) row.brand = detectBrand(text);
  if (!row.model) row.model = extractModel(text);
  if (!row.quantity) row.quantity = extractQuantity(text);
  if (!row.price) row.price = extractBudget(text);
  return row;
}

function normalizeSupply(row) {
  const leadTimeDays = Number(row.leadTimeDays) || 0;
  const stockStatus = row.stockStatus || "现货";
  const title = row.title || [row.model, row.condition, stockStatus].filter(Boolean).join(" ");
  return {
    ...DEFAULT_SUPPLY,
    ...row,
    title,
    condition: row.condition || DEFAULT_SUPPLY.condition,
    stockStatus,
    leadTimeDays: stockStatus === "现货" ? 0 : leadTimeDays,
    arrivalDate: stockStatus === "现货" ? "现货" : `${leadTimeDays}天`,
    deliveryDate: stockStatus === "现货" ? "现货" : `${leadTimeDays}天`,
    quantity: Number(row.quantity) || 1,
    customerTag: normalizeCustomerTag(row.customerTag),
    isUrgent: parseBoolean(row.isUrgent),
    specDetails: {
      brand: row.brand || "",
      model: row.model || "",
      cpu: row.cpu || "",
      memory: row.memory || "",
      storage: row.storage || "",
      gpu: row.gpu || "",
      nic: row.nic || ""
    }
  };
}

function normalizeDemand(row) {
  const title = row.title || [row.model, row.customerTag, row.deliveryDate].filter(Boolean).join(" ");
  return {
    ...DEFAULT_DEMAND,
    ...row,
    title,
    quantity: Number(row.quantity) || 1,
    customerTag: normalizeCustomerTag(row.customerTag),
    isUrgent: parseBoolean(row.isUrgent)
  };
}

function validateItem(type, item) {
  if (type === "supply") {
    const missing = ["title", "category", "condition", "quantity", "price", "contactName", "contactMethod"].filter((field) => !String(item[field] || "").trim());
    if (missing.length) return `缺少：${missing.join("、")}`;
    return ["未标注", "未标记", "未设置"].includes(String(item.condition || "").trim()) ? "请填写明确成色" : "";
  }
  const missing = ["title", "contactName", "contactPhone"].filter((field) => !String(item[field] || "").trim());
  return missing.length ? `缺少：${missing.join("、")}` : "";
}


function pickMatch(text, patterns, fallback = "") {
  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);
    if (match) {
      return (match[1] || match[0] || "").trim();
    }
  }
  return fallback;
}

function detectBrand(text) {
  const brands = ["Dell", "HPE", "Lenovo", "NVIDIA", "AMD", "Samsung", "Intel", "Seagate", "Micron", "SK hynix"];
  return brands.find((brand) => text.toLowerCase().includes(brand.toLowerCase())) || "";
}

function extractContactName(text) {
  return pickMatch(text, [
    /(?:联系人|对接人|姓名)[:：\s]*([\u4e00-\u9fa5A-Za-z]{2,12})/,
    /([\u4e00-\u9fa5]{1,4}(?:总|经理|哥|姐|先生|女士))/
  ]);
}

function extractContactMethod(text) {
  return pickMatch(text, [
    /(1[3-9]\d{9})/,
    /(?:微信|wx|WX|电话|手机)[:：\s]*([A-Za-z0-9_-]{5,})/
  ]);
}

function extractQuantity(text) {
  const value = pickMatch(text, [
    /(?:数量|求购|需要|需求)[:：\s]*(\d+)\s*(?:台|套|个|条|块|颗|张)?/,
    /(\d+)\s*(?:台|套|个|条|块|颗|张)/
  ], "1");
  return Number(value) || 1;
}

function extractModel(text) {
  return pickMatch(text, [
    /(?:型号|机型|规格)[:：\s]*([A-Za-z0-9][A-Za-z0-9\-\s]{1,24})/,
    /\b(R\d{3,4}|DL\d{3}\s*Gen\d+|A\d{2,4}|H\d{2,4}|L40S|B\d{3}|X\d{3})\b/i
  ]);
}

function extractDelivery(text) {
  if (/现货|当天|今天/.test(text)) {
    return "现货";
  }
  const days = pickMatch(text, [/(\d+)\s*天(?:内|左右)?/]);
  return days ? `${days}天内` : "3天内";
}

function extractBudget(text) {
  return pickMatch(text, [
    /(?:预算|价格|报价|单价)[:：\s]*[¥￥]?\s*(\d{4,})/,
    /[¥￥]\s*(\d{4,})/,
    /(\d{4,})\s*(?:元|块|左右|以内)?/
  ]);
}

function extractGpu(text) {
  return pickMatch(text, [
    /(?:GPU|显卡)[:：\s]*([A-Za-z0-9\u4e00-\u9fa5\s]{1,18})/i,
    /(\d+)\s*卡/
  ], "无");
}

function buildItemFromOcrText(type, text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  const model = extractModel(compact);
  const brand = detectBrand(compact);
  const quantity = extractQuantity(compact);
  const contactName = extractContactName(compact);
  const contactMethod = extractContactMethod(compact);
  const isUrgent = /急|紧急|加急|今天|马上|尽快/.test(compact);
  if (type === "supply") {
    const price = extractBudget(compact);
    return normalizeSupply({
      title: [model, "图片识别货源"].filter(Boolean).join(" "),
      category: /内存/.test(compact) ? "内存" : /SSD|固态/.test(compact) ? "SSD固态" : /机械盘|企业盘/.test(compact) ? "企业机械盘" : /GPU|显卡|A100|H100|L40S/.test(compact) ? "GPU" : /CPU|至强|EPYC/.test(compact) ? "CPU" : /网卡/.test(compact) ? "网卡" : /模组|光模块/.test(compact) ? "模组" : /机头|准系统/.test(compact) ? "机头" : "整机服务器",
      condition: /拆机/.test(compact) ? "拆机" : /二手/.test(compact) ? "二手" : "全新",
      stockStatus: /期货/.test(compact) ? "期货" : /准现货/.test(compact) ? "准现货" : "现货",
      brand,
      model,
      quantity,
      price,
      location: pickMatch(compact, [/(深圳|北京|上海|广州|杭州|成都|东莞|香港)/], "深圳"),
      contactName,
      contactMethod,
      isUrgent: isUrgent ? "是" : "",
      remark: compact.slice(0, 120)
    });
  }
  return normalizeDemand({
    title: pickMatch(compact, [/(?:需求标题|标题)[:：\s]*([^，。,;；]{2,30})/]) || [model, "求买需求"].filter(Boolean).join(" "),
    customerTag: /新客户/.test(compact) ? "新客户" : "老客户",
    brand,
    model,
    gpu: extractGpu(compact),
    quantity,
    budgetMax: extractBudget(compact),
    deliveryDate: extractDelivery(compact),
    region: pickMatch(compact, [/(深圳|北京|上海|广州|杭州|成都|东莞|香港)/], "深圳"),
    contactName,
    contactPhone: contactMethod,
    isUrgent: isUrgent ? "是" : "",
    remark: compact.slice(0, 120)
  });
}

function extractOcrText(result) {
  const data = result && (result.data || result.result || result);
  if (!data) {
    return "";
  }
  if (typeof data === "string") {
    return data;
  }
  const candidates = data.items || data.words_result || data.ocr_result || data.results || data.texts || [];
  if (Array.isArray(candidates)) {
    return candidates.map((item) => item.text || item.words || item.word || item.value || "").filter(Boolean).join("\n");
  }
  return data.text || data.fullText || data.words || "";
}
function rowToLooseObject(cells, type) {
  const text = cells.join(" ");
  return type === "supply" ? applyLooseConfig({ remark: text }, SUPPLY_ALIASES) : {
    title: pickMatch(text, [/(?:需求标题|标题)[:：\s]*([^，。,;；]{2,30})/]) || "",
    customerTag: /新客户/.test(text) ? "新客户" : "老客户",
    brand: detectBrand(text),
    model: extractModel(text),
    gpu: extractGpu(text),
    quantity: extractQuantity(text),
    budgetMax: extractBudget(text),
    deliveryDate: extractDelivery(text),
    region: pickMatch(text, [/(深圳|北京|上海|广州|杭州|成都|东莞|香港)/], "深圳"),
    contactName: extractContactName(text),
    contactPhone: extractContactMethod(text),
    isUrgent: /急|紧急|加急|今天|马上|尽快/.test(text) ? "是" : "",
    remark: text.slice(0, 120)
  };
}

function buildItems(type, rows) {
  const aliases = type === "supply" ? SUPPLY_ALIASES : DEMAND_ALIASES;
  const headerMap = buildHeaderMap(rows[0] || [], aliases);
  const hasHeaders = Object.keys(headerMap).length > 0;
  const dataRows = hasHeaders ? rows.slice(1) : rows;
  return dataRows.map((cells, index) => {
    const raw = hasHeaders ? Object.keys(headerMap).reduce((result, field) => {
      result[field] = cells[headerMap[field]] || "";
      return result;
    }, {}) : rowToLooseObject(cells, type);
    if (type === "supply") {
      applyLooseConfig(raw, aliases);
    }
    const item = type === "supply" ? normalizeSupply(raw) : normalizeDemand(raw);
    return {
      ...item,
      rowNo: hasHeaders ? index + 2 : index + 1,
      valid: !validateItem(type, item),
      errorText: validateItem(type, item)
    };
  });
}

Page({
  data: {
    type: "supply",
    title: "批量导入货源",
    pasteText: "",
    items: [],
    validCount: 0,
    errorCount: 0,
    sampleText: "品类\t成色\t状态\t型号\t数量\t价格\t联系人\t电话/微信\t紧急\t备注\n整机服务器\t全新\t现货\tR760\t2\t98000\t张三\twx123\t是\t深圳现货"
  },

  onLoad(query) {
    const type = query.type === "demand" ? "demand" : "supply";
    const mode = query.mode === "image" ? "image" : "batch";
    const title = mode === "image"
      ? (type === "demand" ? "图片识别需求" : "图片识别货源")
      : (type === "demand" ? "批量导入需求" : "批量导入货源");
    const sampleText = type === "demand"
      ? "需求标题\t客户标签\t品牌\t型号\tGPU\t数量\t预算上限\t期望交期\t地区\t对接人\t电话/微信\t紧急\n深圳客户急需R760\t老客户\tDell\tR760\t4卡\t2\t180000\t3天内\t深圳\t李四\twx456\t是"
      : this.data.sampleText;
    this.setData({ type, mode, title, sampleText });
  },

  onPasteInput(event) {
    this.setData({ pasteText: event.detail.value });
  },

  parsePasteText() {
    this.parseText(this.data.pasteText);
  },


  chooseImageForOcr() {
    const onSuccess = (path) => {
      this.setData({ imagePath: path });
      this.runImageOcr(path);
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: (res) => {
          const file = (res.tempFiles || [])[0];
          if (file && file.tempFilePath) {
            onSuccess(file.tempFilePath);
          }
        }
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sourceType: ["album", "camera"],
      success: (res) => onSuccess((res.tempFilePaths || [])[0])
    });
  },

  runImageOcr(path) {
    if (!wx.serviceMarket || !wx.serviceMarket.invokeService) {
      wx.showModal({
        title: "无法识别图片",
        content: "当前小程序环境没有可用OCR服务。请开通微信服务市场OCR，或先把图片文字复制到下方输入框再识别。",
        showCancel: false
      });
      return;
    }
    wx.showLoading({ title: "识别中" });
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: "base64",
      success: (fileRes) => {
        wx.serviceMarket.invokeService({
          service: "wx79ac3de8be320b71",
          api: "OcrAllInOne",
          data: {
            img_data: fileRes.data,
            data_type: 2,
            ocr_type: 1
          },
          success: (res) => {
            wx.hideLoading();
            const text = extractOcrText(res);
            if (!text) {
              wx.showToast({ title: "未识别到文字", icon: "none" });
              return;
            }
            this.setData({ ocrText: text, pasteText: text });
            this.parseRecognizedText(text);
          },
          fail: () => {
            wx.hideLoading();
            wx.showModal({
              title: "OCR服务不可用",
              content: "请确认小程序已开通微信服务市场OCR。也可以把图片文字复制到输入框后点击识别。",
              showCancel: false
            });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "读取图片失败", icon: "none" });
      }
    });
  },

  parseRecognizedText(text) {
    const rows = parseTableText(text);
    if (rows.length >= 2 && rows[0].length >= 2) {
      this.parseText(text);
      return;
    }
    const item = buildItemFromOcrText(this.data.type, text);
    const errorText = validateItem(this.data.type, item);
    const items = [{
      ...item,
      rowNo: 1,
      valid: !errorText,
      errorText
    }];
    this.setData({
      items,
      validCount: items.filter((entry) => entry.valid).length,
      errorCount: items.filter((entry) => !entry.valid).length
    });
  },
  chooseFile() {
    if (!wx.chooseMessageFile) {
      wx.showToast({ title: "当前基础库不支持文件选择", icon: "none" });
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["csv", "txt", "xlsx", "xls"],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) {
          return;
        }
        if (/\.(xlsx|xls)$/i.test(file.name || file.path || "")) {
          wx.showModal({
            title: "暂不直接解析Excel",
            content: "当前环境无法直接读取xlsx二进制内容。请复制表格内容粘贴到输入框，系统会识别不标准表头、配置串和键值对。",
            showCancel: false
          });
          return;
        }
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: "utf8",
          success: (fileRes) => {
            this.setData({ pasteText: fileRes.data || "" });
            this.parseText(fileRes.data || "");
          },
          fail: () => wx.showToast({ title: "读取文件失败", icon: "none" })
        });
      }
    });
  },

  useSample() {
    this.setData({ pasteText: this.data.sampleText });
    this.parseText(this.data.sampleText);
  },

  parseText(text) {
    const rows = parseTableText(text);
    if (rows.length < 2) {
      wx.showToast({ title: "请至少包含表头和一行数据", icon: "none" });
      return;
    }
    const items = buildItems(this.data.type, rows);
    this.setData({
      items,
      validCount: items.filter((item) => item.valid).length,
      errorCount: items.filter((item) => !item.valid).length
    });
  },

  removeItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    const items = this.data.items.filter((_, currentIndex) => currentIndex !== index);
    this.setData({
      items,
      validCount: items.filter((item) => item.valid).length,
      errorCount: items.filter((item) => !item.valid).length
    });
  },

  confirmImport() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    const validItems = this.data.items.filter((item) => item.valid);
    if (!validItems.length) {
      wx.showToast({ title: "没有可发布的数据", icon: "none" });
      return;
    }
    try {
      validItems.forEach((item) => {
        if (this.data.type === "supply") {
          inventoryService.upsertItemToCloud(item, app.globalData.activeUserId);
        } else {
          demandService.upsertDemandToCloud(item, app.globalData.activeUserId);
        }
      });
      wx.showToast({ title: `已发布${validItems.length}条`, icon: "success" });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.showToast({ title: error.message || "发布失败", icon: "none" });
    }
  }
});
