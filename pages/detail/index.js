const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");
const authService = require("../../services/auth");
const subscribeService = require("../../services/subscribe");
const { INVENTORY_STATUS } = require("../../utils/constants");

function normalizeMediaFiles(item = {}) {
  const mediaFiles = Array.isArray(item.mediaFiles) ? item.mediaFiles : [];
  const normalized = mediaFiles
    .map((file) => {
      if (typeof file === "string") {
        return { url: file, type: /\.(mp4|mov|webm)$/i.test(file) ? "video" : "image" };
      }
      const url = file && (file.url || file.tempFilePath);
      return url ? { ...file, url, type: file.type || file.fileType || (/\.(mp4|mov|webm)$/i.test(url) ? "video" : "image") } : null;
    })
    .filter(Boolean);
  const existingUrls = normalized.map((file) => file.url);
  const imageFiles = (Array.isArray(item.imageUrls) ? item.imageUrls : [])
    .filter((url) => url && !existingUrls.includes(url))
    .map((url) => ({ url, type: "image" }));
  const legacyFiles = [];
  if (item.image && !existingUrls.includes(item.image)) {
    legacyFiles.push({ url: item.image, type: "image" });
  }
  if (item.video && !existingUrls.includes(item.video)) {
    legacyFiles.push({ url: item.video, type: "video" });
  }
  return [...normalized, ...imageFiles, ...legacyFiles].slice(0, 12);
}

function prepareDetailItem(item) {
  if (!item) {
    return item;
  }
  const mediaFiles = normalizeMediaFiles(item);
  return {
    ...item,
    mediaFiles,
    imageUrls: mediaFiles
      .filter((file) => file.type !== "video")
      .map((file) => file.url)
  };
}

Page({
  data: {
    id: "",
    type: "supply",
    item: null,
    logs: [],
    demandMatches: [],
    supplyMatches: [],
    canOperate: false,
    canCancelFollow: false,
    canForceDeleteDemand: false,
    processingAction: "",
    canvasWidth: 750,
    canvasHeight: 1200,
    confirmSold: false,
    confirmSoldToken: ""
  },

  onLoad(query) {
    this.setData({
      id: query.id || "",
      type: query.type || "supply",
      confirmSold: query.confirmSold === "1" ? true : false,
      confirmSoldToken: query.token || ""
    });
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    app.refreshCloudData()
      .then(() => this.loadData())
      .then(() => {
        // 如果是订阅消息点击进入的成交确认，则弹窗
        if (this.data.confirmSold && this.data.item && this.data.item.status === INVENTORY_STATUS.SOLD) {
          this.showSoldConfirmDialog();
        }
      })
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
  },

  onCloudSynced() {
    this.loadData();
  },

  loadData() {
    if (this.data.type === "demand") {
      const demand = demandService.getDemandById(this.data.id);
      this.setData({
        item: prepareDetailItem(demand),
        canOperate: this.canOperateItem(demand),
        canCancelFollow: this.canCancelFollowItem(demand),
        canForceDeleteDemand: this.canForceDeleteDemand(demand)
      });
      return;
    }
    const item = service.getItemById(this.data.id, app.globalData.activeUserId);
    const logs = service.getLogsByInventoryId(this.data.id);
    this.setData({
      item: prepareDetailItem(item),
      logs,
      canOperate: this.canOperateItem(item),
      canCancelFollow: this.canCancelFollowItem(item),
      canForceDeleteDemand: false
    });
  },

  canOperateItem(item) {
    if (!item) {
      return false;
    }
    if (item.offlineReviewStatus === "pending" || item.completionReviewStatus === "pending") {
      return false;
    }
    if (this.data.type === "demand") {
      return item.status !== "done" && item.status !== "offline";
    }
    return item.status !== INVENTORY_STATUS.SOLD && item.status !== INVENTORY_STATUS.OFFLINE;
  },

  canCancelFollowItem(item) {
    if (!item) return false;
    const isOwnFollow = item.followOwnerId === app.globalData.activeUserId;
    return isOwnFollow;
  },

  canForceDeleteDemand(item) {
    const currentUser = app.globalData.currentUser || app.refreshSession();
    return this.data.type === "demand"
      && !!item
      && item.status !== "offline"
      && item.status !== "done"
      && authService.isAdminUser(currentUser);
  },

  runStatusAction(actionKey, taskFactory, successTitle, afterSuccess) {
    if (this.data.processingAction) {
      return;
    }
    this.setData({ processingAction: actionKey });
    return Promise.resolve()
      .then(taskFactory)
      .then(() => {
        if (typeof afterSuccess === "function") {
          afterSuccess();
        } else {
          this.loadData();
        }
        if (successTitle) wx.showToast({ title: successTitle, icon: "success" });
      })
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }))
      .finally(() => this.setData({ processingAction: "" }));
  },

  editItem() {
    if (!this.data.canOperate) {
      wx.showToast({ title: "当前状态不可操作", icon: "none" });
      return;
    }
    if (this.data.type === "demand") {
      wx.navigateTo({ url: `/pages/demand-form/index?id=${this.data.id}` });
      return;
    }
    if (!this.data.item || !this.data.item.canEdit) {
      wx.showToast({ title: "只能编辑自己发布的货源", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/form/index?id=${this.data.id}` });
  },

  markFollowing() {
    if (!this.data.canOperate) {
      wx.showToast({ title: "当前状态不可操作", icon: "none" });
      return;
    }
    // 静默请求跟进提醒授权（不打断操作流程）
    const tmplIds = subscribeService.getLocalTemplateIds();
    subscribeService.requestMessageSubscription([
      tmplIds.TM_FOLLOW,
      tmplIds.TM_APPROVAL
    ]).catch(() => {});
    this.runStatusAction("follow", () => this.data.type === "demand"
      ? demandService.updateDemandStatusToCloud(this.data.id, app.globalData.activeUserId, "following")
      : service.updateStatusToCloud(this.data.id, app.globalData.activeUserId, INVENTORY_STATUS.FOLLOWING, "标记跟进中"), "已标记跟进中");
  },

  markSold() {
    if (!this.data.canOperate) {
      wx.showToast({ title: "当前状态不可操作", icon: "none" });
      return;
    }
    // 请求成交确认提醒授权（弹出授权框）
    const tmplIds = subscribeService.getLocalTemplateIds();
    subscribeService.requestMessageSubscription([tmplIds.TM_SOLD_CONFIRM]).catch(() => {});
    wx.showModal({
      title: "确认完成",
      content: this.data.type === "demand"
        ? "确认后该需求将直接标记为已完成，并从默认需求池隐藏。"
        : "确认后该货源将直接标记为已完成，并从默认货源池隐藏。",
      success: (res) => {
        if (!res.confirm) return;
        this.runStatusAction("complete", () => this.data.type === "demand"
          ? demandService.updateDemandStatusToCloud(this.data.id, app.globalData.activeUserId, "done")
          : service.updateStatusToCloud(this.data.id, app.globalData.activeUserId, INVENTORY_STATUS.SOLD, "标记已完成"), "已完成");
      }
    });
  },

  // 订阅消息点击进入的成交确认弹窗
  showSoldConfirmDialog() {
    const item = this.data.item;
    if (!item) return;
    wx.showModal({
      title: "确认成交",
      content: `您标记的"${item.title}"已被标记为已售出/已完成。\n\n请确认是否真实成交？`,
      confirmText: "确认成交",
      cancelText: "误操作，撤销",
      success: (res) => {
        if (res.confirm) {
          // 确认成交，无需操作，状态保持 SOLD
          wx.showToast({ title: "已确认成交", icon: "success" });
        } else {
          // 误操作，回退状态（需要调用服务撤销）
          this.revertSoldStatus();
        }
        // 重置确认标志
        this.setData({ confirmSold: false, confirmSoldToken: "" });
      }
    });
  },

  // 撤销误标记的成交状态，回退到上一状态
  revertSoldStatus() {
    if (!this.data.canOperate) {
      wx.showToast({ title: "当前状态不可操作", icon: "none" });
      return;
    }
    const revertTarget = this.data.item.previousStatus || INVENTORY_STATUS.ON_SALE;
    if (this.data.type === "demand") {
      demandService.updateDemandStatusToCloud(this.data.id, app.globalData.activeUserId, revertTarget)
        .then(() => wx.showToast({ title: "已撤销，成交状态已回退", icon: "success" }))
        .catch((err) => wx.showToast({ title: err.message || "撤销失败", icon: "none" }));
    } else {
      service.updateStatusToCloud(this.data.id, app.globalData.activeUserId, revertTarget, "撤销成交，回退状态")
        .then(() => wx.showToast({ title: "已撤销，成交状态已回退", icon: "success" }))
        .catch((err) => wx.showToast({ title: err.message || "撤销失败", icon: "none" }));
    }
  },

  markOffline() {
    if (!this.data.canOperate) {
      wx.showToast({ title: "当前状态不可操作", icon: "none" });
      return;
    }
    const currentUser = app.globalData.currentUser || app.refreshSession();
    const isAdmin = authService.isAdminUser(currentUser);
    if (!this.data.item || (!isAdmin && this.data.item.creatorId !== app.globalData.activeUserId && !this.data.item.canEdit)) {
      wx.showToast({ title: this.data.type === "demand" ? "只能下架自己创建的需求" : "只能下架自己上传的货源", icon: "none" });
      return;
    }
    const isDemand = this.data.type === "demand";
    wx.showActionSheet({
      itemList: isDemand ? ["客户已在别处完成采购", "其他原因"] : ["货源已在别处售出", "其他原因"],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          this.runStatusAction("offline", () => isDemand
            ? demandService.directOfflineDemandToCloud(this.data.id, app.globalData.activeUserId, "客户已在别处完成采购")
            : service.directOfflineItemToCloud(this.data.id, app.globalData.activeUserId, "货源已在别处售出"), "已下架");
          return;
        }
        wx.showModal({
          title: "申请下架",
          editable: true,
          placeholderText: "请填写下架原因",
          success: (res) => {
            if (!res.confirm) return;
            const reason = (res.content || "").trim();
            if (!reason) {
              wx.showToast({ title: "请填写下架原因", icon: "none" });
              return;
            }
            this.runStatusAction("offline", () => isAdmin
              ? (isDemand
                ? demandService.directOfflineDemandToCloud(this.data.id, app.globalData.activeUserId, reason)
                : service.directOfflineItemToCloud(this.data.id, app.globalData.activeUserId, reason))
              : (isDemand
                ? demandService.requestOfflineDemandToCloud(this.data.id, app.globalData.activeUserId, reason)
                : service.requestOfflineItemToCloud(this.data.id, app.globalData.activeUserId, reason)), isAdmin ? "已下架" : "已提交审核");
          }
        });
      }
    });
  },

  forceDeleteDemand() {
    if (!this.data.canForceDeleteDemand) {
      wx.showToast({ title: "仅管理员可删除需求", icon: "none" });
      return;
    }
    wx.showModal({
      title: "删除需求",
      content: "删除后该需求将从需求池移除，并同步删除网页端记录。",
      editable: true,
      placeholderText: "请填写删除原因",
      success: (res) => {
        if (!res.confirm) return;
        const reason = (res.content || "").trim() || "管理员删除";
        demandService.forceDeleteDemandToCloud(this.data.id, app.globalData.activeUserId, reason)
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            setTimeout(() => wx.navigateBack(), 400);
          })
          .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
      }
    });
  },

  cancelFollow() {
    if (!this.data.canOperate) {
      wx.showToast({ title: "当前状态不可操作", icon: "none" });
      return;
    }
    const item = this.data.item;
    const isOwnFollow = item.followOwnerId === app.globalData.activeUserId;
    if (!isOwnFollow) {
      wx.showToast({ title: "只能由当前跟进人取消跟进", icon: "none" });
      return;
    }
    this.runStatusAction("cancel_follow", () => this.data.type === "demand"
      ? demandService.cancelFollowDemandToCloud(this.data.id, app.globalData.activeUserId)
      : service.cancelFollowItemToCloud(this.data.id, app.globalData.activeUserId), "已取消跟进");
  },

  previewMedia(event) {
    const current = event.currentTarget.dataset.url;
    const urls = this.data.item && Array.isArray(this.data.item.imageUrls) ? this.data.item.imageUrls : [];
    wx.previewImage({ current, urls: urls.length ? urls : [current] });
  },

  previewVideo(event) {
    const url = event.currentTarget.dataset.url;
    if (!wx.previewMedia) {
      wx.showToast({ title: "当前基础库不支持预览视频", icon: "none" });
      return;
    }
    wx.previewMedia({
      sources: [{ url, type: "video" }]
    });
  },

  saveLongImage() {
    if (!this.data.item) {
      return;
    }
    const item = this.data.item;
    const type = this.data.type;

    // 颜色
    const C = {
      bg: "#f4f7fb",
      cardBg: "#ffffff",
      brand: "#133a5e",
      title: "#17324d",
      label: "#8a98ab",
      value: "#3b4a5f",
      price: "#c25c39",
      line: "#e4ebf2",
      remarkBg: "#f6f9fc",
      remarkText: "#6d7f93"
    };

    // 信息行：每行 = [标签, 值, 是否价格高亮]
    let rows = [];
    if (type === "demand") {
      rows = [
        ["需求类型", item.businessTypeText || "求买"],
        ["客户", item.customerTag],
        ["品牌型号", `${item.brand || ""} ${item.model || ""}`.trim()],
        ["GPU需求", item.gpu || "未填写"],
        ["数量", item.quantity ? `${item.quantity}台` : "未填写"],
        ["预算", item.budgetText || "面议", true],
        ["交期", item.deliveryDate || "待确认"],
        ["地区", item.region || "未填写"],
        ["联系人", item.contactName || "未填写"],
        ["电话", item.contactPhone || "未填写"]
      ];
    } else {
      rows = [
        ["业务类型", item.businessTypeText || "出售"],
        ["品类", item.category || "未填写"],
        ["成色", item.condition || "未标注"],
        ["库存", item.stockStatus || "未标注"],
        ["交期", item.leadTimeText || "现货"],
        ["品牌", item.brand || "未填写"],
        ["型号", item.model || "未填写"],
        ["数量", item.quantity ? `${item.quantity}台` : "未填写"],
        ["价格", item.priceLabel || "面议", true],
        ["联系人", item.contactName || "未填写"],
        ["电话", item.contactMethod || "未填写"]
      ];
    }

    // 过滤空行
    rows = rows.filter(([label, val]) => String(val || "").trim() !== "" && label !== "");

    const PAD = 48;        // 白边内左边距
    const CARD_X = 40;
    const CARD_W = 670;
    const CONTENT_X = CARD_X + PAD;
    const CONTENT_W = CARD_W - PAD * 2;
    const BRAND_H = 130;
    const TITLE_H = 100;
    const ROW_H = 64;
    const SECTION_GAP = 36;
    const FOOTER_H = 72;
    const REMARK_PAD = 24;
    const REMARK_LINE_H = 34;

    const bodyH = TITLE_H + rows.length * ROW_H + SECTION_GAP;
    const remark = String(item.remark || "").trim();
    // 预先按 4 行估算备注高度（后面实际渲染时会重新计算）
    const remarkH = remark ? Math.max(80, 40 + 4 * REMARK_LINE_H + 20) : 0;
    const height = BRAND_H + bodyH + remarkH + FOOTER_H;

    const query = wx.createSelectorQuery().in(this);
    query.select("#shareCanvas").fields({ node: true, size: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) {
        wx.showToast({ title: "当前基础库不支持保存", icon: "none" });
        return;
      }
      canvas.width = 750;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      // --- 第一遍：计算实际备注行数以确定真实高度 ---
      const remarkLines = remark ? _wrapText(ctx, remark, CONTENT_W - REMARK_PAD * 2, 22) : [];
      const actualRemarkH = remark ? Math.max(80, 40 + remarkLines.length * REMARK_LINE_H + 20) : 0;
      const actualHeight = BRAND_H + bodyH + actualRemarkH + FOOTER_H;
      canvas.height = actualHeight;
      // canvas 高度变化后 context 会重置，重新获取
      const actCtx = canvas.getContext("2d");

      // 背景
      actCtx.fillStyle = C.bg;
      actCtx.fillRect(0, 0, 750, actualHeight);

      // 白卡片背景
      actCtx.fillStyle = C.cardBg;
      actCtx.beginPath();
      _roundRect(actCtx, CARD_X, 40, CARD_W, actualHeight - 80, 24);
      actCtx.fill();

      // 顶部色条
      actCtx.fillStyle = C.brand;
      actCtx.beginPath();
      _roundRectTop(actCtx, CARD_X, 40, CARD_W, 10, 24);
      actCtx.fill();

      // 品牌标题（主标题，大而醒目）
      actCtx.fillStyle = C.brand;
      actCtx.font = "bold 38px sans-serif";
      actCtx.fillText("润六尺供需信息", CONTENT_X, 116);

      // 副标题（产品型号，小一号）
      let y = 172;
      const titleText = (type === "demand" ? item.title : (item.displayTitle || item.title)) || "未命名";
      actCtx.fillStyle = C.title;
      actCtx.font = "30px sans-serif";
      const titleDisplay = _textWidth(actCtx, titleText, CONTENT_X, CONTENT_W) ? _ellipsisText(actCtx, titleText, CONTENT_W, 30, "normal") : titleText;
      actCtx.fillText(titleDisplay, CONTENT_X, y);

      // 信息行（上方保留分隔线）
      y += 52;
      actCtx.strokeStyle = C.line;
      actCtx.lineWidth = 1;
      actCtx.beginPath();
      actCtx.moveTo(CONTENT_X, y);
      actCtx.lineTo(CARD_X + CARD_W - PAD, y);
      actCtx.stroke();
      y += 28;

      rows.forEach(([label, val, isPrice]) => {
        // 标签
        actCtx.fillStyle = C.label;
        actCtx.font = "24px sans-serif";
        actCtx.fillText(label, CONTENT_X, y);

        // 值
        if (isPrice) {
          actCtx.fillStyle = C.price;
          actCtx.font = "bold 30px sans-serif";
        } else {
          actCtx.fillStyle = C.value;
          actCtx.font = "28px sans-serif";
        }
        const valStr = String(val || "");
        const valMaxW = CONTENT_W - 160;
        const valText = _textWidth(actCtx, valStr, CONTENT_X + 160, valMaxW) ? _ellipsisText(actCtx, valStr, valMaxW, isPrice ? 30 : 28, isPrice ? "bold" : "normal") : valStr;
        actCtx.fillText(valText, CONTENT_X + 160, y);

        y += ROW_H;
      });

      // 备注（完整显示，自动换行）
      if (remark) {
        y += 16;
        actCtx.fillStyle = C.remarkBg;
        actCtx.beginPath();
        _roundRect(actCtx, CONTENT_X, y, CONTENT_W, actualRemarkH - 16, 12);
        actCtx.fill();

        actCtx.fillStyle = C.remarkText;
        actCtx.font = "22px sans-serif";
        remarkLines.forEach((line, i) => {
          actCtx.fillText(line, CONTENT_X + REMARK_PAD, y + 36 + i * REMARK_LINE_H);
        });
        y += actualRemarkH;
      }

      // 底部：分隔线 + 平台标识
      y += 16;
      actCtx.strokeStyle = C.line;
      actCtx.lineWidth = 1;
      actCtx.beginPath();
      actCtx.moveTo(CONTENT_X, y);
      actCtx.lineTo(CARD_X + CARD_W - PAD, y);
      actCtx.stroke();

      actCtx.fillStyle = C.label;
      actCtx.font = "20px sans-serif";
      actCtx.fillText("查看更多货源 · 润六尺供需平台", CONTENT_X, y + 38);

      // 透明水印（润六尺内部信息）
      actCtx.save();
      actCtx.globalAlpha = 0.08;
      actCtx.fillStyle = "#133a5e";
      actCtx.font = "bold 48px sans-serif";
      actCtx.textAlign = "center";
      actCtx.textBaseline = "middle";
      actCtx.translate(375, actualHeight / 2);
      actCtx.rotate(-0.5);
      actCtx.fillText("润六尺内部信息", 0, 0);
      actCtx.restore();

      wx.canvasToTempFilePath({
        canvas,
        destWidth: 750,
        destHeight: actualHeight,
        success: (fileRes) => {
          wx.saveImageToPhotosAlbum({
            filePath: fileRes.tempFilePath,
            success: () => wx.showToast({ title: "已保存图片", icon: "success" }),
            fail: () => wx.showToast({ title: "保存失败，请检查相册权限", icon: "none" })
          });
        },
        fail: () => wx.showToast({ title: "生成图片失败", icon: "none" })
      }, this);
    });
  }
});

// ========== canvas 辅助函数 ==========
function _roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _roundRectTop(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _textWidth(ctx, text, startX, maxW) {
  return ctx.measureText(text).width > maxW;
}

function _ellipsisText(ctx, text, maxW, fontSize, weight) {
  ctx.font = `${weight} ${fontSize}px sans-serif`;
  if (ctx.measureText(text).width <= maxW) return text;
  for (let i = text.length; i > 0; i--) {
    if (ctx.measureText(text.slice(0, i) + "…").width <= maxW) {
      return text.slice(0, i) + "…";
    }
  }
  return text.slice(0, 8) + "…";
}

function _wrapText(ctx, text, maxW, fontSize) {
  ctx.font = `${fontSize}px sans-serif`;
  const chars = text.split("");
  const lines = [];
  let current = "";
  for (const char of chars) {
    const test = current + char;
    if (ctx.measureText(test).width > maxW && current) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

