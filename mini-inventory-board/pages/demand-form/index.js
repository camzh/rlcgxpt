const app = getApp();
const demandService = require("../../services/demand");
const {
  BUSINESS_TYPES,
  PRICE_UNIT_OPTIONS,
  PRICE_UNITS,
  normalizePriceUnit,
  getPriceUnitPickerLabel
} = require("../../utils/constants");

const DEFAULT_FORM = {
  title: "",
  customerTag: "\u8001\u5ba2\u6237",
  brand: "",
  model: "",
  gpu: "",
  quantity: 1,
  budgetMin: "",
  budgetMax: "",
  budgetUnit: PRICE_UNITS.CNY_TEN_THOUSAND,
  deliveryDays: 3,
  deliveryDate: "3\u5929\u5185",
  region: "\u6df1\u5733",
  contactName: "",
  contactPhone: "",
  businessType: BUSINESS_TYPES.SALE,
  rentalTerm: "\u4e00\u5e74",
  rentalMode: "\u5168\u5305",
  rentalBudgetMin: "",
  rentalBudgetMax: "",
  status: "pending",
  isUrgent: false,
  usageScenario: "",
  acceptableCondition: "全新/拆机均可",
  invoiceRequired: "不限",
  paymentTerms: "",
  decisionDeadline: "",
  imageUrls: [],
  mediaFiles: [],
  remark: ""
};

const PICK_OPTIONS = {
  customerTag: ["\u65b0\u5ba2\u6237", "\u8001\u5ba2\u6237"],
  brand: ["Dell", "HPE", "Lenovo", "Supermicro", "其他"],
  model: ["R760", "B300", "X380", "其他"],
  gpu: ["\u65e0", "4\u5361", "8\u5361"],
  businessType: [
    { label: "\u6c42\u4e70", value: BUSINESS_TYPES.SALE },
    { label: "\u6c42\u79df", value: BUSINESS_TYPES.RENT },
    { label: "\u53ef\u4e70\u53ef\u79df", value: BUSINESS_TYPES.BOTH }
  ],
  rentalTerm: ["\u4e00\u5e74", "\u4e8c\u5e74", "\u4e09\u5e74"],
  rentalMode: ["\u5168\u5305", "\u642c\u8fc1"]
};

function parseDeliveryDays(value) {
  const text = String(value || "").trim();
  if (!text || text === "现货") {
    return 0;
  }
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) || 0 : 0;
}

function buildDeliveryDate(days) {
  const value = Math.max(Number(days) || 0, 0);
  return value > 0 ? `${value}天内` : "现货";
}
function getOptionLabel(options, value, fallback) {
  const found = options.find((item) => (item.value || item) === value);
  return found ? (found.label || found) : fallback;
}

function applyAccountContact(form, user) {
  return {
    ...form,
    contactName: user.name || "",
    contactPhone: user.phone || ""
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

Page({
  data: {
    id: "",
    isEdit: false,
    customerTagLabel: DEFAULT_FORM.customerTag,
    brandLabel: DEFAULT_FORM.brand,
    modelLabel: DEFAULT_FORM.model,
    gpuLabel: DEFAULT_FORM.gpu,
    businessTypeLabel: "\u6c42\u4e70",
    budgetUnitLabel: getPriceUnitPickerLabel(DEFAULT_FORM.budgetUnit),
    showRentalFields: false,
    rentalTermLabel: DEFAULT_FORM.rentalTerm,
    rentalModeLabel: DEFAULT_FORM.rentalMode,
    form: { ...DEFAULT_FORM },
    customerTagOptions: PICK_OPTIONS.customerTag,
    brandOptions: PICK_OPTIONS.brand,
    modelOptions: PICK_OPTIONS.model,
    gpuOptions: PICK_OPTIONS.gpu,
    businessTypeOptions: PICK_OPTIONS.businessType,
    budgetUnitOptions: PRICE_UNIT_OPTIONS,
    rentalTermOptions: PICK_OPTIONS.rentalTerm,
    rentalModeOptions: PICK_OPTIONS.rentalMode
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
    const demand = demandService.getDemands().find((item) => item.id === id);
    if (!demand) {
      return;
    }
    const deliveryDays = demand.deliveryDays !== undefined ? Number(demand.deliveryDays) || 0 : parseDeliveryDays(demand.deliveryDate);
    const form = { ...DEFAULT_FORM, ...demand, deliveryDays, deliveryDate: buildDeliveryDate(deliveryDays), customerTag: demand.customerTag || DEFAULT_FORM.customerTag };
    this.setData({
      id,
      isEdit: true,
      customerTagLabel: form.customerTag,
      brandLabel: form.brand || "\u8bf7\u586b\u5199",
      modelLabel: form.model || "\u8bf7\u586b\u5199",
      gpuLabel: form.gpu || "\u8bf7\u586b\u5199",
      businessTypeLabel: getOptionLabel(this.data.businessTypeOptions, form.businessType, "\u6c42\u4e70"),
      budgetUnitLabel: getPriceUnitPickerLabel(form.budgetUnit),
      showRentalFields: form.businessType !== BUSINESS_TYPES.SALE,
      rentalTermLabel: form.rentalTerm || DEFAULT_FORM.rentalTerm,
      rentalModeLabel: form.rentalMode || DEFAULT_FORM.rentalMode,
      form: {
        ...form,
        mediaFiles: normalizeMediaFiles(form),
        imageUrls: getImageUrls(normalizeMediaFiles(form))
      }
    });
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onDeliveryDaysInput(event) {
    const deliveryDays = Math.max(Number(event.detail.value) || 0, 0);
    this.setData({
      "form.deliveryDays": deliveryDays,
      "form.deliveryDate": buildDeliveryDate(deliveryDays)
    });
  },

  onPickerChange(event) {
    const { field } = event.currentTarget.dataset;
    const index = Number(event.detail.value);
    const map = {
      customerTag: this.data.customerTagOptions,
      brand: this.data.brandOptions,
      model: this.data.modelOptions,
      gpu: this.data.gpuOptions,
      businessType: this.data.businessTypeOptions,
      budgetUnit: this.data.budgetUnitOptions,
      rentalTerm: this.data.rentalTermOptions,
      rentalMode: this.data.rentalModeOptions
    };
    const selected = map[field] && map[field][index];
    if (!selected) {
      return;
    }
    const selectedValue = selected.value || selected;
    const selectedLabel = selected.label || selected;
    const labelMap = {
      customerTag: "customerTagLabel",
      brand: "brandLabel",
      model: "modelLabel",
      gpu: "gpuLabel",
      businessType: "businessTypeLabel",
      budgetUnit: "budgetUnitLabel",
      rentalTerm: "rentalTermLabel",
      rentalMode: "rentalModeLabel"
    };
    this.setData({
      [`form.${field}`]: field === "budgetUnit" ? normalizePriceUnit(selectedValue) : selectedValue,
      [labelMap[field]]: selectedLabel,
      showRentalFields: field === "businessType" ? selectedValue !== BUSINESS_TYPES.SALE : this.data.showRentalFields
    });
  },

  goBatchImport() {
    wx.navigateTo({ url: "/pages/batch-import/index?type=demand" });
  },

  goImageRecognize() {
    wx.navigateTo({ url: "/pages/batch-import/index?type=demand&mode=image" });
  },

  chooseImages() {
    if (!wx.chooseMedia) {
      wx.chooseImage({
        count: 6,
        success: (res) => {
          const files = (res.tempFilePaths || []).map((url) => ({ url, type: "image" }));
          const mediaFiles = [...this.data.form.mediaFiles, ...files].slice(0, 6);
          this.setData({
            "form.mediaFiles": mediaFiles,
            "form.imageUrls": getImageUrls(mediaFiles)
          });
        }
      });
      return;
    }
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
  },

  previewMedia(event) {
    wx.previewImage({ current: event.currentTarget.dataset.url, urls: this.data.form.imageUrls });
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

  onUrgentChange(event) {
    this.setData({ "form.isUrgent": event.detail.value.length > 0 });
  },

  submitForm() {
    const user = app.globalData.currentUser || app.requireApprovedUser();
    const form = applyAccountContact({
      ...this.data.form,
      deliveryDate: buildDeliveryDate(this.data.form.deliveryDays)
    }, user);
    if (!form.title || !form.contactName || !form.contactPhone) {
      wx.showToast({ title: "\u8bf7\u586b\u5199\u6807\u9898\u548c\u5bf9\u63a5\u4fe1\u606f", icon: "none" });
      return;
    }
    if (form.businessType !== BUSINESS_TYPES.SALE && !form.rentalBudgetMin && !form.rentalBudgetMax) {
      wx.showToast({ title: "\u8bf7\u586b\u5199\u79df\u8d41\u9884\u7b97", icon: "none" });
      return;
    }
    try {
      wx.showLoading({ title: "\u540c\u6b65\u4e2d" });
      demandService.upsertDemandToCloud(form, app.globalData.activeUserId, this.data.id)
        .then(() => {
          wx.showToast({ title: this.data.isEdit ? "\u5df2\u66f4\u65b0" : "\u5df2\u521b\u5efa", icon: "success" });
          setTimeout(() => wx.navigateBack(), 400);
        })
        .catch((error) => wx.showToast({ title: error.message, icon: "none" }))
        .finally(() => wx.hideLoading());
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  }
});
