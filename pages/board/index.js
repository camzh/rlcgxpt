const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");
const { INVENTORY_STATUS } = require("../../utils/constants");
const { clearPageCloudRefresh, schedulePageCloudRefresh } = require("../../utils/page-sync");

const URGENT_FILTER = "urgent";
const RENTABLE_FILTER = "rentable";
const BUYING_FILTER = "buying";
const REVIEWING_FILTER = "reviewing";
const EMPTY_SUPPLY_STATS = { onSale: 0, following: 0, sold: 0, pendingReview: 0, todayAdded: 0, todaySold: 0 };
const EMPTY_DEMAND_STATS = { total: 0, following: 0, done: 0, pending: 0 };
const DEMAND_STATUS_MAP = {
  [INVENTORY_STATUS.ON_SALE]: "pending",
  [INVENTORY_STATUS.FOLLOWING]: "following",
  [INVENTORY_STATUS.SOLD]: "done",
  [INVENTORY_STATUS.OFFLINE]: "closed"
};
const BOARD_STORAGE_KEYS = [
  "inventory_board_items",
  "inventory_board_demands"
];
const PAGE_SIZE = 30;

// 只保留 wxml 实际用到的字段，减少 setData 跨线程传输量
const SUPPLY_CARD_FIELDS = [
  "id", "isUrgent", "cardTitle", "displayTitle", "title",
  "cardSubtitle", "category", "model", "cardStatusClass", "cardStatusText",
  "priceLabel", "quantity", "location", "leadTimeText",
  "creatorContactText", "creatorName", "rentalLineText",
  "followOwnerText", "ownerLabel", "updatedAtText"
];
const DEMAND_CARD_FIELDS = [
  "id", "isUrgent", "cardTitle", "title",
  "cardSubtitle", "customerTag", "contactName",
  "cardStatusClass", "cardStatusText", "budgetText",
  "quantity", "region", "deliveryDate",
  "creatorContactText", "creatorName", "rentalLineText",
  "followOwnerText", "updatedAtText"
];

function pickCardFields(item, fields) {
  const slim = {};
  for (let i = 0; i < fields.length; i++) {
    slim[fields[i]] = item[fields[i]];
  }
  return slim;
}

function boardSignature(state, userId) {
  try {
    const filters = {
      userId: userId || "",
      keyword: state.keyword || "",
      selectedStatus: state.selectedStatus || "all",
      activePool: state.activePool || "supply",
      selectedSource: state.selectedSource || "all"
    };
    return [
      JSON.stringify(filters),
      ...BOARD_STORAGE_KEYS.map((key) => {
        const rows = wx.getStorageSync(key) || [];
        if (!Array.isArray(rows) || !rows.length) return `${key}:0`;
        const first = rows[0] || {};
        const last = rows[rows.length - 1] || {};
        return [
          key,
          rows.length,
          first.id || "",
          first.updatedAt || first.createdAt || "",
          last.id || "",
          last.updatedAt || last.createdAt || ""
        ].join(":");
      })
    ].join("|");
  } catch (error) {
    return `${Date.now()}`;
  }
}

Page({
  data: {
    keyword: "",
    selectedStatus: "all",
    activePool: "supply",
    statusOptions: [
      { label: "\u5168\u90e8", value: "all" },
      { label: "\u7d27\u6025", value: URGENT_FILTER },
      { label: "在售", value: INVENTORY_STATUS.ON_SALE },
      { label: "\u79df\u8d41", value: RENTABLE_FILTER },
      { label: "\u6c42\u8d2d", value: BUYING_FILTER },
      { label: "\u8ddf\u8fdb\u4e2d", value: INVENTORY_STATUS.FOLLOWING },
      { label: "审批中", value: REVIEWING_FILTER }
    ],
    selectedSource: "all",
    supplySourceOptions: [
      { label: "\u5168\u90e8\u6765\u6e90", value: "all" },
      { label: "\u6211\u7684\u8d27\u6e90", value: "mine" },
      { label: "\u516c\u53f8\u8d27\u6e90", value: "company" },
      { label: "\u5176\u4ed6\u8d27\u6e90", value: "others" }
    ],
    demandSourceOptions: [
      { label: "\u5168\u90e8\u6765\u6e90", value: "all" },
      { label: "\u6211\u7684\u9700\u6c42", value: "mine" },
      { label: "\u516c\u53f8\u9700\u6c42", value: "company" },
      { label: "\u5176\u4ed6\u9700\u6c42", value: "others" }
    ],
    stats: { onSale: 0, following: 0, sold: 0, pendingReview: 0, todayAdded: 0, todaySold: 0 },
    demandStats: { total: 0, following: 0, done: 0, pending: 0 },
    reviewQueueCount: 0,
    supplyCount: 0,
    demandCount: 0,
    supplyList: [],
    demandList: [],
    hasMoreSupply: false,
    hasMoreDemand: false,
    currentSourceOptions: [],
    pageError: ""
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    app.syncCustomTabBar(0);
    this.syncSourceOptions();
    this.loadData();
    schedulePageCloudRefresh(this, app, { notify: false }, {
      success: (res) => {
        if (!res || !res.skipped) this.loadData();
      },
      fail: (error) => {
        const message = error && error.message ? error.message : "同步失败";
        this.setData({ pageError: message });
        wx.showToast({ title: message, icon: "none" });
      }
    });
  },

  onHide() {
    clearPageCloudRefresh(this);
  },

  onCloudSynced() {
    this.loadData();
  },


  syncSourceOptions() {
    const currentSourceOptions = this.data.activePool === "supply" ? this.data.supplySourceOptions : this.data.demandSourceOptions;
    if (this.data.currentSourceOptions === currentSourceOptions) {
      return;
    }
    this.setData({
      currentSourceOptions
    });
  },
  loadData() {
    try {
      const signature = boardSignature(this.data, app.globalData.activeUserId);
      if (signature === this._lastBoardSignature) {
        return;
      }
      const selectedStatus = this.data.selectedStatus;
      const isUrgentFilter = selectedStatus === URGENT_FILTER;
      const businessFilter = selectedStatus === RENTABLE_FILTER || selectedStatus === BUYING_FILTER ? selectedStatus : "all";
      const isReviewingFilter = selectedStatus === REVIEWING_FILTER;
      const supplyStatus = this.data.activePool === "supply" && !isUrgentFilter && !isReviewingFilter && businessFilter === "all" ? selectedStatus : "all";
      const demandStatus = this.data.activePool === "demand" && !isUrgentFilter && !isReviewingFilter && businessFilter === "all" && selectedStatus !== "all"
        ? DEMAND_STATUS_MAP[selectedStatus] || selectedStatus
        : "all";
      const supplyFilters = {
        keyword: this.data.keyword,
        status: supplyStatus,
        urgentOnly: isUrgentFilter,
        reviewPendingOnly: isReviewingFilter,
        businessFilter,
        sourceFilter: this.data.activePool === "supply" ? this.data.selectedSource : "all",
        currentUserId: app.globalData.activeUserId
      };
      const demandFilters = {
        keyword: this.data.keyword,
        status: demandStatus,
        urgentOnly: isUrgentFilter,
        reviewPendingOnly: isReviewingFilter,
        businessFilter,
        sourceFilter: this.data.activePool === "demand" ? this.data.selectedSource : "all",
        currentUserId: app.globalData.activeUserId,
        creatorId: ""
      };
      const supply = this.data.activePool === "supply"
        ? service.getBoardData(supplyFilters)
        : { list: [], stats: EMPTY_SUPPLY_STATS, reviewQueueCount: 0 };
      const demands = this.data.activePool === "demand"
        ? demandService.getDemandBoardData(demandFilters)
        : { list: [], stats: EMPTY_DEMAND_STATS };
      // 当前池用 list.length；非当前池用轻量 countItems/countDemands，跳过 sort+decorate
      const supplyCount = this.data.activePool === "supply"
        ? supply.list.length
        : service.countItems({ keyword: this.data.keyword, currentUserId: app.globalData.activeUserId });
      const demandCount = this.data.activePool === "demand"
        ? demands.list.length
        : demandService.countDemands({ keyword: this.data.keyword });
      // 字段裁剪：只保留 wxml 用到的字段，减少 setData 跨线程传输量
      const supplyFull = supply.list.map((item) => pickCardFields(item, SUPPLY_CARD_FIELDS));
      const demandFull = demands.list.map((item) => pickCardFields(item, DEMAND_CARD_FIELDS));
      // 分页：只渲染前 PAGE_SIZE 条，剩余通过 onReachBottom 懒加载
      this._allSupplyItems = supplyFull;
      this._allDemandItems = demandFull;
      this._supplyPage = 1;
      this._demandPage = 1;
      this.setData({
        stats: supply.stats,
        demandStats: demands.stats,
        supplyList: supplyFull.slice(0, PAGE_SIZE),
        demandList: demandFull.slice(0, PAGE_SIZE),
        supplyCount,
        demandCount,
        hasMoreSupply: supplyFull.length > PAGE_SIZE,
        hasMoreDemand: demandFull.length > PAGE_SIZE,
        reviewQueueCount: supply.reviewQueueCount,
        pageError: ""
      });
      this._lastBoardSignature = signature;
    } catch (error) {
      const message = error && error.message ? error.message : "页面加载失败";
      console.error("board loadData failed", message);
      this.setData({ pageError: message, supplyList: [], demandList: [], supplyCount: 0, demandCount: 0 });
    }
  },

  onKeywordChange(event) {
    this.setData({ keyword: event.detail.value });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.loadData();
    }, 300);
  },


  onSourceChange(event) {
    this.setData({ selectedSource: event.currentTarget.dataset.value });
    this.loadData();
  },
  onStatusChange(event) {
    this.setData({ selectedStatus: event.currentTarget.dataset.value });
    this.loadData();
  },

  switchPool(event) {
    const activePool = event.currentTarget.dataset.pool;
    this.setData({
      activePool,
      selectedSource: "all",
      currentSourceOptions: activePool === "supply" ? this.data.supplySourceOptions : this.data.demandSourceOptions
    });
    this.loadData();
  },

  goDetail(event) {
    const { id, type } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/index?id=${id}&type=${type || "supply"}` });
  },

  goCreate() {
    wx.showActionSheet({
      itemList: ["新增货源信息", "新增需求信息"],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          wx.navigateTo({ url: "/pages/form/index" });
        } else if (tapIndex === 1) {
          wx.navigateTo({ url: "/pages/demand-form/index" });
        }
      }
    });
  },

  onReachBottom() {
    if (this.data.activePool === "supply" && this.data.hasMoreSupply) {
      this._supplyPage++;
      const visible = this._allSupplyItems.slice(0, this._supplyPage * PAGE_SIZE);
      this.setData({
        supplyList: visible,
        hasMoreSupply: this._allSupplyItems.length > visible.length
      });
    } else if (this.data.activePool === "demand" && this.data.hasMoreDemand) {
      this._demandPage++;
      const visible = this._allDemandItems.slice(0, this._demandPage * PAGE_SIZE);
      this.setData({
        demandList: visible,
        hasMoreDemand: this._allDemandItems.length > visible.length
      });
    }
  },

  onPullDownRefresh() {
    app.refreshCloudData({ notify: false, force: true })
      .then(() => this.loadData())
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }))
      .finally(() => wx.stopPullDownRefresh());
  }
});
