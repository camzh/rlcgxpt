const app = getApp();
const inventoryService = require("../../services/inventory");
const demandService = require("../../services/demand");

const TYPE_OPTIONS = [
  { label: "全部对象", value: "all" },
  { label: "货源", value: "supply" },
  { label: "需求", value: "demand" }
];

const DATE_OPTIONS = [
  { label: "全部时间", value: "all" },
  { label: "今天", value: "today" },
  { label: "近7天", value: "7d" },
  { label: "近30天", value: "30d" }
];

const ACTION_OPTIONS = [
  { label: "全部动作", value: "all" },
  { label: "新增", value: "create" },
  { label: "编辑", value: "edit" },
  { label: "跟进", value: "follow" },
  { label: "成交/完成", value: "complete" },
  { label: "下架/删除", value: "offline" },
  { label: "审批", value: "review" }
];

const INITIAL_LOG_RENDER_COUNT = 60;
const LOG_RENDER_STEP = 60;
const INITIAL_LOG_SOURCE_LIMIT = 40;
const LOG_STORAGE_KEYS = [
  "inventory_board_logs",
  "inventory_board_demand_logs"
];

const STATUS_TEXT = {
  on_sale: "在售",
  following: "跟进中",
  sold: "已完成",
  done: "已完成",
  offline: "已下架",
  pending: "待处理",
  approved: "已通过",
  rejected: "已拒绝",
  auto: "自动通过"
};

function text(value) {
  return String(value || "").trim();
}

function toTime(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayLabel(dateKey) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateKey === formatDate(today)) return "今天";
  if (dateKey === formatDate(yesterday)) return "昨天";
  return dateKey;
}

function shorten(value, limit = 64) {
  const source = text(value).replace(/\s+/g, " ");
  if (source.length <= limit) return source;
  return `${source.slice(0, limit)}...`;
}

function getTypeText(itemType) {
  return itemType === "demand" ? "需求" : "货源";
}

function getActionCategory(log) {
  const source = `${text(log.actionText || log.actionType)} ${text(log.remark)}`.toLowerCase();
  if (/审核|审批|申请/.test(source)) return "review";
  if (/新增|创建|create/.test(source)) return "create";
  if (/跟进|follow/.test(source)) return "follow";
  if (/完成|成交|sold|done|complete/.test(source)) return "complete";
  if (/下架|删除|delete|offline/.test(source)) return "offline";
  return "edit";
}

function statusLabel(value) {
  const raw = text(value);
  return STATUS_TEXT[raw] || raw;
}

function statusChangeText(log) {
  const before = statusLabel(log.beforeStatus);
  const after = statusLabel(log.afterStatus);
  if (before && after && before !== after) return `${before} -> ${after}`;
  return after || before;
}

function buildLogView(log, index, activeUserId, expandedMap) {
  const createdAt = log.createdAt || "";
  const date = new Date(createdAt);
  const dateKey = Number.isFinite(date.getTime()) ? formatDate(date) : "未知日期";
  const id = log.id || `${log.itemType || "log"}_${createdAt || index}_${index}`;
  const actionText = text(log.actionText || log.actionType || "业务操作");
  const targetTitle = text(log.targetTitle || "未命名记录");
  const operatorName = text(log.operatorName || "未知人员");
  const remark = text(log.remark);
  const typeText = getTypeText(log.itemType);
  const actionCategory = getActionCategory(log);
  const statusText = statusChangeText(log);
  const detailRows = [
    { label: "时间", value: log.createdAtText || createdAt },
    { label: "人员", value: operatorName },
    { label: "对象", value: targetTitle },
    { label: "类型", value: typeText },
    { label: "动作", value: actionText },
    statusText ? { label: "状态", value: statusText } : null,
    remark ? { label: "备注", value: remark } : null
  ].filter(Boolean);

  return {
    id,
    itemType: log.itemType || "",
    inventoryId: log.inventoryId || "",
    demandId: log.demandId || "",
    operatorId: log.operatorId || "",
    createdAt,
    createdAtText: log.createdAtText || "",
    actionType: log.actionType || "",
    beforeStatus: log.beforeStatus || "",
    afterStatus: log.afterStatus || "",
    dateKey,
    timeText: formatTime(createdAt),
    sortTime: toTime(createdAt),
    typeText,
    actionText,
    targetTitle,
    operatorName,
    actionCategory,
    statusText,
    remark,
    remarkPreview: shorten(remark, 72),
    detailRows,
    isMine: log.operatorId === activeUserId,
    isExpanded: !!expandedMap[id]
  };
}

function escapeCsv(value) {
  return `"${String(value === undefined || value === null ? "" : value).replace(/"/g, '""')}"`;
}

function hasActiveFilters(filters = {}) {
  return filters.type !== "all"
    || filters.dateRange !== "all"
    || filters.action !== "all"
    || !!text(filters.keyword)
    || !!text(filters.operator);
}

function storageRowsSignature(key) {
  const rows = wx.getStorageSync(key) || [];
  if (!Array.isArray(rows) || !rows.length) {
    return `${key}:0`;
  }
  const first = rows[0] || {};
  const last = rows[rows.length - 1] || {};
  return [
    key,
    rows.length,
    first.id || "",
    first.createdAt || "",
    last.id || "",
    last.createdAt || ""
  ].join(":");
}

function logDataSignature(filters, full) {
  try {
    return [
      full ? "full" : "initial",
      JSON.stringify(filters || {}),
      LOG_STORAGE_KEYS.map(storageRowsSignature).join("|")
    ].join("|");
  } catch (error) {
    return `${Date.now()}`;
  }
}

Page({
  data: {
    typeOptions: TYPE_OPTIONS,
    dateOptions: DATE_OPTIONS,
    actionOptions: ACTION_OPTIONS,
    typeIndex: 0,
    dateIndex: 0,
    actionIndex: 0,
    filters: {
      type: "all",
      dateRange: "all",
      action: "all",
      keyword: "",
      operator: ""
    },
    logSections: [],
    summary: { total: 0, filtered: 0 },
    filterSummary: "全部日志",
    exportStatus: "",
    expandedLogIds: {}
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) return;
    app.syncCustomTabBar(1);
    this.loadLogs();
    app.refreshCloudData({ notify: false }).then((res) => {
      if (!res || !res.skipped) this.loadLogs();
    });
  },

  onCloudSynced() {
    this.loadLogs();
  },

  onUnload() {
    clearTimeout(this._filterTimer);
  },

  loadLogs(options = {}) {
    const full = options.full === true || hasActiveFilters(this.data.filters);
    const signature = logDataSignature(this.data.filters, full);
    if (signature === this._lastLogSignature) {
      return;
    }
    const timelineOptions = full ? {} : { limit: INITIAL_LOG_SOURCE_LIMIT };
    const rawLogs = [...inventoryService.getTimeline(timelineOptions), ...demandService.getTimeline(timelineOptions)]
      .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
    const allLogs = rawLogs.map((log, index) => buildLogView(log, index, app.globalData.activeUserId, this.data.expandedLogIds));
    this._allLogs = allLogs;
    this._hasFullLogs = full;
    this._lastLogSignature = signature;
    this._totalLogCount = full
      ? allLogs.length
      : ((inventoryService.getTimelineCount && inventoryService.getTimelineCount()) || 0)
        + ((demandService.getTimelineCount && demandService.getTimelineCount()) || 0);
    this.applyFilters({ resetRenderLimit: true });
  },

  ensureFullLogs() {
    if (this._hasFullLogs) return;
    this.loadLogs({ full: true });
  },

  applyFilters(options = {}) {
    const allLogs = this._allLogs || [];
    const { filters } = this.data;
    const keyword = text(filters.keyword).toLowerCase();
    const operator = text(filters.operator).toLowerCase();
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filteredLogs = allLogs.filter((log) => {
      if (filters.type !== "all" && log.itemType !== filters.type) return false;
      if (filters.action !== "all" && log.actionCategory !== filters.action) return false;
      if (filters.dateRange === "today" && log.sortTime < today.getTime()) return false;
      if (filters.dateRange === "7d" && now - log.sortTime > 7 * 24 * 60 * 60 * 1000) return false;
      if (filters.dateRange === "30d" && now - log.sortTime > 30 * 24 * 60 * 60 * 1000) return false;
      if (operator && !log.operatorName.toLowerCase().includes(operator)) return false;
      if (keyword) {
        const source = [log.actionText, log.targetTitle, log.operatorName, log.statusText, log.remark, log.typeText].join(" ").toLowerCase();
        if (!source.includes(keyword)) return false;
      }
      return true;
    });

    this._filteredLogs = filteredLogs;
    const totalCount = this._hasFullLogs ? allLogs.length : (this._totalLogCount || allLogs.length);
    const filteredCount = !this._hasFullLogs && !hasActiveFilters(filters) ? totalCount : filteredLogs.length;
    if (options.resetRenderLimit || !this._renderLimit) {
      this._renderLimit = INITIAL_LOG_RENDER_COUNT;
    }
    const renderedLogs = filteredLogs.slice(0, this._renderLimit);
    this.setData({
      logSections: this.groupLogs(renderedLogs),
      summary: { total: totalCount, filtered: filteredCount },
      filterSummary: this.buildFilterSummary(filteredCount),
      exportStatus: ""
    });
  },

  groupLogs(logs) {
    const sections = [];
    const sectionByKey = new Map();
    logs.forEach((log) => {
      let section = sectionByKey.get(log.dateKey);
      if (!section) {
        section = { key: log.dateKey, label: dayLabel(log.dateKey), logs: [] };
        sectionByKey.set(log.dateKey, section);
        sections.push(section);
      }
      section.logs.push(log);
    });
    return sections;
  },

  buildFilterSummary(count) {
    const labels = [];
    const date = DATE_OPTIONS[this.data.dateIndex];
    const type = TYPE_OPTIONS[this.data.typeIndex];
    const action = ACTION_OPTIONS[this.data.actionIndex];
    if (date && date.value !== "all") labels.push(date.label);
    if (type && type.value !== "all") labels.push(type.label);
    if (action && action.value !== "all") labels.push(action.label);
    if (this.data.filters.operator) labels.push(this.data.filters.operator);
    if (this.data.filters.keyword) labels.push(`关键词：${this.data.filters.keyword}`);
    return `${labels.length ? labels.join(" · ") : "全部日志"} · ${count} 条`;
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value) || 0;
    this.setData({ typeIndex, "filters.type": TYPE_OPTIONS[typeIndex].value }, () => this.ensureFullLogs());
  },

  onDateChange(event) {
    const dateIndex = Number(event.detail.value) || 0;
    this.setData({ dateIndex, "filters.dateRange": DATE_OPTIONS[dateIndex].value }, () => this.ensureFullLogs());
  },

  onActionChange(event) {
    const actionIndex = Number(event.detail.value) || 0;
    this.setData({ actionIndex, "filters.action": ACTION_OPTIONS[actionIndex].value }, () => this.ensureFullLogs());
  },

  onFilterInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`filters.${field}`]: event.detail.value });
    clearTimeout(this._filterTimer);
    this._filterTimer = setTimeout(() => this.ensureFullLogs(), 200);
  },

  resetFilters() {
    clearTimeout(this._filterTimer);
    this.setData({
      typeIndex: 0,
      dateIndex: 0,
      actionIndex: 0,
      filters: {
        type: "all",
        dateRange: "all",
        action: "all",
        keyword: "",
        operator: ""
      }
    });
    this.applyFilters({ resetRenderLimit: true });
  },

  toggleLogDetail(event) {
    const id = event.currentTarget.dataset.id;
    const expandedLogIds = { ...this.data.expandedLogIds, [id]: !this.data.expandedLogIds[id] };
    this._allLogs = (this._allLogs || []).map((log) => (
      log.id === id ? { ...log, isExpanded: !!expandedLogIds[log.id] } : log
    ));
    this.setData({ expandedLogIds });
    this.applyFilters();
  },

  openExportActions() {
    clearTimeout(this._filterTimer);
    this.ensureFullLogs();
    const filteredLogs = this._filteredLogs || [];
    const allLogs = this._allLogs || [];
    const filteredCount = filteredLogs.length;
    const totalCount = allLogs.length;
    wx.showActionSheet({
      itemList: [`导出当前筛选结果（${filteredCount}条）`, `导出全部业务日志（${totalCount}条）`],
      success: (res) => {
        if (res.tapIndex === 0) this.confirmExport(filteredLogs, "筛选日志");
        if (res.tapIndex === 1) this.confirmExport(allLogs, "全部日志");
      }
    });
  },

  onReachBottom() {
    const filteredLogs = this._filteredLogs || [];
    if ((this._renderLimit || 0) >= filteredLogs.length) return;
    this._renderLimit = (this._renderLimit || INITIAL_LOG_RENDER_COUNT) + LOG_RENDER_STEP;
    this.applyFilters();
  },

  confirmExport(logs, label) {
    if (!logs.length) {
      wx.showToast({ title: "暂无可导出日志", icon: "none" });
      return;
    }
    wx.showModal({
      title: "导出业务日志",
      content: `将导出 ${logs.length} 条${label}，是否继续？`,
      confirmText: "导出",
      success: (res) => {
        if (res.confirm) this.exportLogs(logs, label);
      }
    });
  },

  buildCsv(logs) {
    const header = ["时间", "操作人", "对象类型", "对象名称", "操作类型", "状态变化", "备注", "关联编号"];
    const rows = logs.map((log) => [
      log.createdAtText || log.createdAt || "",
      log.operatorName,
      log.typeText,
      log.targetTitle,
      log.actionText,
      log.statusText,
      log.remark,
      log.inventoryId || log.demandId || ""
    ]);
    return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  },

  exportLogs(logs, label) {
    const csv = `\ufeff${this.buildCsv(logs)}`;
    const fileName = `业务日志-${label}-${Date.now()}.csv`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
    wx.getFileSystemManager().writeFile({
      filePath,
      data: csv,
      encoding: "utf8",
      success: () => this.shareExportFile(filePath, fileName, csv, logs.length),
      fail: () => this.copyExportToClipboard(csv, logs.length)
    });
  },

  shareExportFile(filePath, fileName, csv, count) {
    if (typeof wx.shareFileMessage === "function") {
      wx.shareFileMessage({
        filePath,
        fileName,
        success: () => this.setData({ exportStatus: `已生成并分享 ${count} 条日志` }),
        fail: () => this.copyExportToClipboard(csv, count)
      });
      return;
    }
    this.copyExportToClipboard(csv, count);
  },

  copyExportToClipboard(csv, count) {
    wx.setClipboardData({
      data: csv,
      success: () => {
        this.setData({ exportStatus: `已复制 ${count} 条日志 CSV 内容` });
        wx.showToast({ title: "已复制导出内容", icon: "success" });
      },
      fail: () => wx.showToast({ title: "导出失败，请重试", icon: "none" })
    });
  }
});
