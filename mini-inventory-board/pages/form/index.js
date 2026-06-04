const app = getApp();
const service = require("../../services/inventory");
const {
  DEFAULT_ENUM_OPTIONS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_OPTIONS,
  RENTAL_PRICE_OPTIONS,
  PRICE_UNIT_OPTIONS,
  PRICE_UNITS,
  buildDefaultRentalPrices,
  normalizePriceUnit,
  getPriceUnitPickerLabel,
  CATEGORY_OPTIONS,
  CONDITION_OPTIONS
} = require("../../utils/constants");

const CATEGORY_SPECS = {
  "内存": [
    { key: "brand", label: "内存品牌", placeholder: "例如：Samsung / SK hynix / Micron" },
    { key: "model", label: "型号/颗粒", placeholder: "例如：M321R4GA0BB0" },
    { key: "capacity", label: "单条容量", placeholder: "例如：32G / 64G / 128G" },
    { key: "frequency", label: "频率", placeholder: "例如：3200MHz / 4800MHz" },
    { key: "memoryType", label: "类型", placeholder: "例如：DDR4 / DDR5" },
    { key: "rank", label: "规格", placeholder: "例如：RDIMM / LRDIMM / ECC" }
  ],
  "SSD固态": [
    { key: "brand", label: "硬盘品牌", placeholder: "例如：Samsung / Intel / Micron" },
    { key: "model", label: "型号", placeholder: "例如：PM9A3 / P4510 / P5800X" },
    { key: "capacity", label: "容量", placeholder: "例如：1.92T / 3.84T / 7.68T" },
    { key: "interfaceType", label: "接口", placeholder: "例如：SATA / SAS / NVMe / M.2 / U.2" },
    { key: "formFactor", label: "形态", placeholder: "例如：2.5寸 / 3.5寸 / M.2 / U.2 / AIC" },
    { key: "grade", label: "等级/用途", placeholder: "例如：企业级 / 读密集 / 混合读写" }
  ],
  "企业机械盘": [
    { key: "brand", label: "硬盘品牌", placeholder: "例如：Seagate / WD / Toshiba" },
    { key: "model", label: "型号", placeholder: "例如：ST8000NM / WD Ultrastar" },
    { key: "capacity", label: "容量", placeholder: "例如：4T / 8T / 16T / 20T" },
    { key: "interfaceType", label: "接口", placeholder: "例如：SATA / SAS" },
    { key: "formFactor", label: "形态", placeholder: "例如：3.5寸 / 2.5寸" },
    { key: "grade", label: "等级/用途", placeholder: "例如：企业级 / NAS级 / 监控级" }
  ],
  "GPU": [
    { key: "brand", label: "GPU品牌", placeholder: "例如：NVIDIA / AMD" },
    { key: "model", label: "GPU型号", placeholder: "例如：A100 / H100 / L40S / H200" },
    { key: "memory", label: "显存", placeholder: "例如：40G / 80G / 96G" },
    { key: "memoryType", label: "显存类型", placeholder: "例如：HBM2e / HBM3 / GDDR6" },
    { key: "power", label: "功耗", placeholder: "例如：300W / 350W / 700W" },
    { key: "formFactor", label: "形态/接口", placeholder: "例如：PCIe / SXM / FHFL" }
  ],
  "整机服务器": [
    { key: "brand", label: "服务器品牌", placeholder: "例如：Dell / HPE / Lenovo / Supermicro" },
    { key: "model", label: "服务器型号", placeholder: "例如：R760 / DL380 Gen11 / SA5212H" },
    { key: "cpu", label: "CPU", placeholder: "例如：Xeon Gold 6430 / AMD EPYC 9654" },
    { key: "cpuCount", label: "CPU数量", placeholder: "例如：2颗" },
    { key: "memory", label: "内存容量", placeholder: "例如：512G / 1T" },
    { key: "memoryBrand", label: "内存品牌", placeholder: "例如：Samsung / SK hynix" },
    { key: "diskCount", label: "硬盘数量", placeholder: "例如：8块" },
    { key: "diskBrand", label: "硬盘品牌", placeholder: "例如：Samsung / Intel" },
    { key: "diskCapacity", label: "硬盘容量", placeholder: "例如：8*7.68T" },
    { key: "powerSupply", label: "电源", placeholder: "例如：双电 1400W" },
    { key: "gpu", label: "GPU配置", placeholder: "例如：无 / 4卡 / 8卡" },
    { key: "nic", label: "网卡", placeholder: "例如：2*100GbE" }
  ],
  "CPU": [
    { key: "brand", label: "CPU品牌", placeholder: "例如：Intel / AMD" },
    { key: "model", label: "CPU型号", placeholder: "例如：Xeon Gold 6430 / AMD EPYC 9654" },
    { key: "cpuCount", label: "数量/包装", placeholder: "例如：1颗 / 10颗/盒" },
    { key: "memory", label: "制程/功耗", placeholder: "例如：10nm / 120W / 350W" },
    { key: "memoryType", label: "系列", placeholder: "例如：Scalable / EPYC / Xeon W" },
    { key: "rank", label: "规格", placeholder: "例如：Gold / Platinum / Silver" }
  ],
  "网卡": [
    { key: "brand", label: "品牌", placeholder: "例如：Mellanox / Intel / Broadcom" },
    { key: "model", label: "型号", placeholder: "例如：ConnectX-6 / XL710 / BC572" },
    { key: "interfaceType", label: "速率", placeholder: "例如：25G / 100G / 200G" },
    { key: "formFactor", label: "形态", placeholder: "例如：PCIe / OCP / Mezz" },
    { key: "nic", label: "端口数", placeholder: "例如：单口 / 双口 / 四口" },
    { key: "power", label: "功耗", placeholder: "例如：10W / 15W" }
  ],
  "模组": [
    { key: "brand", label: "品牌", placeholder: "例如：Intel / Broadcom / Mellanox" },
    { key: "model", label: "型号", placeholder: "例如：QSFP28 / SFP28 / QSFP-DD" },
    { key: "interfaceType", label: "速率", placeholder: "例如：25G / 100G / 400G" },
    { key: "formFactor", label: "波长/距离", placeholder: "例如：1310nm / 850nm / 10km" },
    { key: "memory", label: "封装形式", placeholder: "例如：光模块 / 铜缆模块" },
    { key: "rank", label: "协议", placeholder: "例如：以太网 / InfiniBand" }
  ],
  "机头": [
    { key: "brand", label: "品牌", placeholder: "例如：Dell / HPE / Lenovo" },
    { key: "model", label: "型号", placeholder: "例如：R740 / DL380 / SR650" },
    { key: "cpu", label: "CPU", placeholder: "例如：R740xd机型可配CPU" },
    { key: "memory", label: "内存容量", placeholder: "例如：128G / 256G" },
    { key: "storage", label: "硬盘位", placeholder: "例如：12盘位 / 24盘位" },
    { key: "powerSupply", label: "电源/规格", placeholder: "例如：560W / 750W / 800W" }
  ]
};

const DEFAULT_FORM = {
  title: "",
  category: "整机服务器",
  condition: "",
  stockStatus: "现货",
  leadTimeDays: 0,
  brand: "Dell",
  model: "R760",
  configSummary: "",
  sourceType: "own",
  businessType: BUSINESS_TYPES.SALE,
  rentalPrices: buildDefaultRentalPrices(),
  marketType: "domestic",
  quantity: 1,
  price: "",
  priceUnit: PRICE_UNITS.CNY_TEN_THOUSAND,
  location: "深圳",
  arrivalDate: "现货",
  sourceChannel: "",
  deliveryDate: "现货",
  cpu: "2*Xeon Gold 6430",
  memory: "512G",
  storage: "8*7.68T",
  m2: "2*1.92T",
  gpu: "无",
  nic: "2*100GbE",
  specDetails: {},
  ownerInfo: "",
  contactName: "",
  contactMethod: "",
  customerTag: "老客户",
  imageUrls: [],
  mediaFiles: [],
  warranty: "",
  invoiceType: "",
  packageStatus: "",
  serialNumber: "",
  paymentTerms: "",
  minOrderQuantity: 1,
  warehouse: "深圳",
  qualityReport: "",
  isUrgent: false,
  remark: "",
  displayTitle: "",
  displayPriority: 0,
  displayVisible: true
};

const PICK_OPTIONS = {
  category: CATEGORY_OPTIONS,
  condition: CONDITION_OPTIONS,
  stockStatus: ["期货", "准现货", "现货"].map((value) => ({ label: value, value })),
  customerTag: ["新客户", "老客户"].map((value) => ({ label: value, value }))
};

function buildRentalPriceFields(prices) {
  const values = prices || buildDefaultRentalPrices();
  return RENTAL_PRICE_OPTIONS.map((item) => ({
    ...item,
    value: values[item.key] || ""
  }));
}
function getPickerLabel(options, value) {
  const found = options.find((item) => item.value === value);
  return found ? found.label : value || "请选择";
}

function normalizeSourceType(value) {
  return ["company", "own", "shared"].includes(value) ? value : "own";
}

function buildLeadTimeText(stockStatus, leadTimeDays) {
  const days = Math.max(Number(leadTimeDays) || 0, 0);
  return days > 0 ? `${days}天` : (stockStatus === "现货" ? "现货" : "0天");
}

function buildSpecDetails(form) {
  const existing = form.specDetails || {};
  return {
    ...existing,
    brand: existing.brand || form.brand || "",
    model: existing.model || form.model || "",
    cpu: existing.cpu || form.cpu || "",
    memory: existing.memory || form.memory || "",
    storage: existing.storage || form.storage || "",
    m2: existing.m2 || form.m2 || "",
    gpu: existing.gpu || form.gpu || "",
    nic: existing.nic || form.nic || "",
    diskCapacity: existing.diskCapacity || form.storage || ""
  };
}

function buildSpecFields(category, specDetails) {
  return (CATEGORY_SPECS[category] || CATEGORY_SPECS[DEFAULT_FORM.category]).map((field) => ({
    ...field,
    value: specDetails[field.key] || ""
  }));
}

function syncLegacySpecFields(form) {
  const spec = form.specDetails || {};
  return {
    ...form,
    brand: spec.brand || form.brand || "",
    model: spec.model || form.model || "",
    cpu: spec.cpu || form.cpu || "",
    memory: spec.memory || form.memory || "",
    storage: spec.storage || spec.diskCapacity || form.storage || "",
    gpu: spec.gpu || form.gpu || "",
    nic: spec.nic || form.nic || ""
  };
}

function applyAccountContact(form, user) {
  return {
    ...form,
    contactName: user.name || "",
    contactMethod: user.phone || ""
  };
}

function normalizeMediaFiles(form) {
  const mediaFiles = Array.isArray(form.mediaFiles) ? form.mediaFiles : [];
  if (mediaFiles.length) {
    return mediaFiles.slice(0, 6);
  }
  return (Array.isArray(form.imageUrls) ? form.imageUrls : [])
    .map((url) => ({ url, type: "image" }))
    .slice(0, 6);
}

function getImageUrls(mediaFiles) {
  return mediaFiles
    .filter((item) => item && item.type !== "video")
    .map((item) => item.url || item.tempFilePath || item)
    .filter(Boolean)
    .slice(0, 6);
}

const initialSpecDetails = buildSpecDetails(DEFAULT_FORM);

Page({
  data: {
    id: "",
    isEdit: false,
    sourceTypeOptions: DEFAULT_ENUM_OPTIONS.sourceType,
    businessTypeOptions: BUSINESS_TYPE_OPTIONS,
    priceUnitOptions: PRICE_UNIT_OPTIONS,
    rentalPriceOptions: RENTAL_PRICE_OPTIONS,
    rentalPriceFields: buildRentalPriceFields(DEFAULT_FORM.rentalPrices),    categoryOptions: PICK_OPTIONS.category,
    conditionOptions: PICK_OPTIONS.condition,
    stockStatusOptions: PICK_OPTIONS.stockStatus,
    customerTagOptions: PICK_OPTIONS.customerTag,
    specFields: buildSpecFields(DEFAULT_FORM.category, initialSpecDetails),
    categoryLabel: DEFAULT_FORM.category,
    conditionLabel: "请选择",
    stockStatusLabel: DEFAULT_FORM.stockStatus,
    customerTagLabel: DEFAULT_FORM.customerTag,
    sourceTypeLabel: "我的货源",
    businessTypeLabel: "出售",
    priceUnitLabel: getPriceUnitPickerLabel(DEFAULT_FORM.priceUnit),
    showRentalFields: false,
    showSalePriceField: true,
    form: { ...DEFAULT_FORM, specDetails: initialSpecDetails }
  },

  onLoad(query) {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    const id = query.id || "";
    if (!id) {
      this.setData({
        form: applyAccountContact(this.data.form, user)
      });
      return;
    }
    const item = service.getItemById(id, app.globalData.activeUserId);
    if (!item) {
      return;
    }
    if (!item.canEdit) {
      wx.showToast({ title: "只能编辑自己发布的货源", icon: "none" });
      setTimeout(() => wx.navigateBack(), 400);
      return;
    }
    const specDetails = buildSpecDetails({ ...DEFAULT_FORM, ...item });
    const formData = syncLegacySpecFields({
      ...DEFAULT_FORM,
      ...item,
      sourceType: normalizeSourceType(item.sourceType),
      marketType: item.marketType || DEFAULT_FORM.marketType,
      sourceChannel: item.sourceChannel || "",
      specDetails,
      imageUrls: Array.isArray(item.imageUrls) ? item.imageUrls : [],
      mediaFiles: Array.isArray(item.mediaFiles) ? item.mediaFiles : []
    });
    const mediaFiles = normalizeMediaFiles(formData);
    const form = {
      ...formData,
      mediaFiles,
      imageUrls: getImageUrls(mediaFiles)
    };
    this.setData({
      id,
      isEdit: true,
      categoryLabel: getPickerLabel(this.data.categoryOptions, form.category),
      conditionLabel: getPickerLabel(this.data.conditionOptions, form.condition),
      stockStatusLabel: getPickerLabel(this.data.stockStatusOptions, form.stockStatus),
      customerTagLabel: getPickerLabel(this.data.customerTagOptions, form.customerTag),
      sourceTypeLabel: getPickerLabel(this.data.sourceTypeOptions, form.sourceType),
      businessTypeLabel: getPickerLabel(this.data.businessTypeOptions, form.businessType),
      priceUnitLabel: getPriceUnitPickerLabel(form.priceUnit),
      showRentalFields: form.businessType !== BUSINESS_TYPES.SALE,
      showSalePriceField: form.businessType !== BUSINESS_TYPES.RENT,
      specFields: buildSpecFields(form.category, specDetails),
      rentalPriceFields: buildRentalPriceFields(form.rentalPrices),
      form
    });
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onSpecInput(event) {
    const { field, index } = event.currentTarget.dataset;
    const value = event.detail.value;
    const nextData = {
      [`form.specDetails.${field}`]: value,
      [`specFields[${index}].value`]: value
    };
    if (["brand", "model", "cpu", "memory", "storage", "gpu", "nic"].includes(field)) {
      nextData[`form.${field}`] = value;
    }
    if (field === "diskCapacity") {
      nextData["form.storage"] = value;
    }
    this.setData(nextData);
  },

  onRentalPriceInput(event) {
    const { field, index } = event.currentTarget.dataset;
    this.setData({
      [`form.rentalPrices.${field}`]: event.detail.value,
      [`rentalPriceFields[${index}].value`]: event.detail.value
    });  },
  onLeadTimeInput(event) {
    const value = Math.max(Number(event.detail.value) || 0, 0);
    const leadTimeText = buildLeadTimeText(this.data.form.stockStatus, value);
    this.setData({
      "form.leadTimeDays": value,
      "form.arrivalDate": leadTimeText,
      "form.deliveryDate": leadTimeText
    });
  },

  onPickerChange(event) {
    const { field } = event.currentTarget.dataset;
    const index = Number(event.detail.value);
    const map = {
      category: this.data.categoryOptions,
      condition: this.data.conditionOptions,
      stockStatus: this.data.stockStatusOptions,
      customerTag: this.data.customerTagOptions,
      sourceType: this.data.sourceTypeOptions,
      businessType: this.data.businessTypeOptions,
      priceUnit: this.data.priceUnitOptions
    };
    const selected = map[field] && map[field][index];
    if (!selected) {
      return;
    }
    const nextData = {
      [`form.${field}`]: selected.value,
      [`${field}Label`]: selected.label
    };
    if (field === "priceUnit") {
      nextData["form.priceUnit"] = normalizePriceUnit(selected.value);
      nextData.priceUnitLabel = getPriceUnitPickerLabel(selected.value);
    }
    if (field === "category") {
      nextData.specFields = buildSpecFields(selected.value, this.data.form.specDetails || {});
    }
    if (field === "businessType") {
      nextData.showRentalFields = selected.value !== BUSINESS_TYPES.SALE;
      nextData.showSalePriceField = selected.value !== BUSINESS_TYPES.RENT;
      if (selected.value === BUSINESS_TYPES.RENT) {
        nextData["form.price"] = "";
      }
    }    if (field === "stockStatus") {
      const leadTimeDays = Math.max(Number(this.data.form.leadTimeDays) || 0, 0);
      const leadTimeText = buildLeadTimeText(selected.value, leadTimeDays);
      nextData["form.leadTimeDays"] = leadTimeDays;
      nextData["form.arrivalDate"] = leadTimeText;
      nextData["form.deliveryDate"] = leadTimeText;
    }
    this.setData(nextData);
  },

  onUrgentChange(event) {
    this.setData({ "form.isUrgent": event.detail.value.length > 0 });
  },

  goBatchImport() {
    wx.navigateTo({ url: "/pages/batch-import/index?type=supply" });
  },

  goImageRecognize() {
    wx.navigateTo({ url: "/pages/batch-import/index?type=supply&mode=image" });
  },

  chooseImages() {
    const onSuccess = (paths) => {
      const files = (paths || []).map((url) => ({ url, type: "image" }));
      const mediaFiles = [...this.data.form.mediaFiles, ...files].slice(0, 6);
      this.setData({
        "form.mediaFiles": mediaFiles,
        "form.imageUrls": getImageUrls(mediaFiles)
      });
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 6,
        mediaType: ["image", "video"],
        sourceType: ["album", "camera"],
        success: (res) => {
          const files = (res.tempFiles || []).map((item) => ({ url: item.tempFilePath, type: item.fileType || "image" }));
          const mediaFiles = [...this.data.form.mediaFiles, ...files].slice(0, 6);
          this.setData({
            "form.mediaFiles": mediaFiles,
            "form.imageUrls": getImageUrls(mediaFiles)
          });
        }
      });
      return;
    }
    wx.chooseImage({
      count: 6,
      sourceType: ["album", "camera"],
      success: (res) => onSuccess(res.tempFilePaths || [])
    });
  },

  previewMedia(event) {
    const url = event.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: this.data.form.imageUrls });
  },

  previewVideo(event) {
    const url = event.currentTarget.dataset.url;
    if (!wx.previewMedia) {
      wx.showToast({ title: "\u5f53\u524d\u57fa\u7840\u5e93\u4e0d\u652f\u6301\u9884\u89c8\u89c6\u9891", icon: "none" });
      return;
    }
    wx.previewMedia({
      sources: [{ url, type: "video" }]
    });
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const mediaFiles = this.data.form.mediaFiles.filter((_, currentIndex) => currentIndex !== index);
    this.setData({
      "form.mediaFiles": mediaFiles,
      "form.imageUrls": getImageUrls(mediaFiles)
    });
  },

  submitForm() {
    const user = app.globalData.currentUser || app.requireApprovedUser();
    const form = syncLegacySpecFields(applyAccountContact(this.data.form, user));
    const requiredFields = ["title", "category", "condition", "stockStatus", "quantity", "contactName", "contactMethod"];
    const missing = requiredFields.some((field) => !String(form[field] || "").trim());
    if (missing || (form.sourceType !== "company" && !String(form.ownerInfo || "").trim())) {
      wx.showToast({ title: "请填写基础信息、货主信息和联系方式", icon: "none" });
      return;
    }
    if (["未标注", "未标记", "未设置"].includes(String(form.condition || "").trim())) {
      wx.showToast({ title: "请选择明确成色", icon: "none" });
      return;
    }
    if ((form.businessType === BUSINESS_TYPES.SALE || form.businessType === BUSINESS_TYPES.BOTH) && !String(form.price || "").trim()) {
      wx.showToast({ title: "\u8bf7\u586b\u5199\u51fa\u552e\u4ef7\u683c", icon: "none" });
      return;
    }if (form.businessType !== BUSINESS_TYPES.SALE) {
      const hasRentalPrice = RENTAL_PRICE_OPTIONS.some((item) => String((form.rentalPrices || {})[item.key] || "").trim());
      if (!hasRentalPrice) {
        wx.showToast({ title: "\u8bf7\u81f3\u5c11\u586b\u5199\u4e00\u4e2a\u79df\u8d41\u62a5\u4ef7", icon: "none" });
        return;
      }
    }
    try {
      wx.showLoading({ title: "同步中" });
      service.upsertItemToCloud(form, app.globalData.activeUserId, this.data.id)
        .then(() => {
          wx.showToast({ title: this.data.isEdit ? "已更新" : "已创建", icon: "success" });
          setTimeout(() => wx.navigateBack(), 400);
        })
        .catch((error) => wx.showToast({ title: error.message, icon: "none" }))
        .finally(() => wx.hideLoading());
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  }
});
