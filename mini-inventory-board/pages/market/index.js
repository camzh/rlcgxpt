const app = getApp();
const service = require("../../services/inventory");
const demandService = require("../../services/demand");

const CHART_WIDTH = 620;
const CHART_HEIGHT = 240;
const CHART_PADDING = 24;

function buildPriceChart(pricePoints = []) {
  const points = pricePoints.filter((item) => Number(item.price) > 0).slice(-8);
  if (!points.length) {
    return { points: "", labels: [], minPrice: "0", maxPrice: "0", latestPrice: "0" };
  }
  const prices = points.map((item) => Number(item.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);
  const innerWidth = CHART_WIDTH - CHART_PADDING * 2;
  const innerHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const polyline = points.map((item, index) => {
    const x = CHART_PADDING + (points.length === 1 ? innerWidth : (index / (points.length - 1)) * innerWidth);
    const y = CHART_PADDING + innerHeight - ((Number(item.price) - min) / range) * innerHeight;
    return `${Math.round(x)},${Math.round(y)}`;
  }).join(" ");
  return {
    points: polyline,
    labels: points.map((item) => item.label || "-"),
    minPrice: `${min}`,
    maxPrice: `${max}`,
    latestPrice: `${prices[prices.length - 1]}`
  };
}

Page({
  data: {
    snapshot: { midpoint: "0", pricePoints: [], asks: [], bids: [], totalVolume: 0 },
    chart: { points: "", labels: [], minPrice: "0", maxPrice: "0", latestPrice: "0" },
    board: { onSale: 0, following: 0, sold: 0, pendingReview: 0, todayAdded: 0, todaySold: 0 },
    productOptions: [],
    selectedProductIndex: 0,
    selectedProduct: ""
  },

  onShow() {
    const user = app.requireApprovedUser();
    if (!user) {
      return;
    }
    app.syncCustomTabBar(2);
    this.initMarket();
    app.refreshCloudData()
      .then(() => this.initMarket())
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
  },

  onCloudSynced() {
    this.initMarket();
  },

  buildProductOptions() {
    const supplyModels = service.getBoardData({ currentUserId: app.globalData.activeUserId }).list
      .map((item) => item.model)
      .filter(Boolean);
    const demandModels = demandService.getDemandBoardData({ status: "all" }).list
      .map((item) => item.model)
      .filter(Boolean);
    const products = Array.from(new Set([...supplyModels, ...demandModels])).sort();
    const preferred = products.includes("B300") ? "B300" : products[0] || "";
    return {
      productOptions: products,
      selectedProductIndex: preferred ? products.indexOf(preferred) : 0,
      selectedProduct: preferred
    };
  },

  onProductChange(event) {
    const index = Number(event.detail.value);
    const product = this.data.productOptions[index] || "";
    this.setData({
      selectedProductIndex: index,
      selectedProduct: product
    }, () => this.loadData());
  },

  drawPriceChart(chart) {
    if (!chart.points || !wx.createSelectorQuery) {
      return;
    }
    const query = wx.createSelectorQuery().in(this);
    query.select("#priceTrendCanvas").fields({ node: true, size: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      const size = res && res[0];
      if (!canvas || !size) {
        return;
      }
      const dpr = wx.getSystemInfoSync().pixelRatio || 1;
      canvas.width = size.width * dpr;
      canvas.height = size.height * dpr;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size.width, size.height);
      const scaleX = size.width / CHART_WIDTH;
      const scaleY = size.height / CHART_HEIGHT;
      const points = chart.points.split(" ").map((point) => {
        const [x, y] = point.split(",").map(Number);
        return { x: x * scaleX, y: y * scaleY };
      });
      ctx.strokeStyle = "#dfe8f1";
      ctx.lineWidth = 1;
      [0.25, 0.5, 0.75].forEach((ratio) => {
        const y = size.height * ratio;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size.width, y);
        ctx.stroke();
      });
      ctx.strokeStyle = "#133a5e";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.stroke();
      ctx.fillStyle = "#c25c39";
      points.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  },
  loadData() {
    if (!this.data.selectedProduct) {
      const emptyChart = { points: "", labels: [], minPrice: "0", maxPrice: "0", latestPrice: "0" };
      this.setData({
        snapshot: { midpoint: "0", pricePoints: [], asks: [], bids: [], totalVolume: 0 },
        chart: emptyChart,
        board: { onSale: 0, following: 0, sold: 0, pendingReview: 0, todayAdded: 0, todaySold: 0 }
      });
      return;
    }
    const snapshot = service.getMarketSnapshot(this.data.selectedProduct);
    const chart = buildPriceChart(snapshot.pricePoints);
    const boardData = service.getBoardData({
      currentUserId: app.globalData.activeUserId,
      keyword: this.data.selectedProduct
    });
    this.setData({
      snapshot,
      chart,
      board: {
        ...this.data.board,
        onSale: boardData.list.filter((item) => item.status === "on_sale").length,
        following: boardData.list.filter((item) => item.status === "following").length
      }
    }, () => this.drawPriceChart(chart));
  },

  initMarket() {
    const productState = this.buildProductOptions();
    this.setData(productState, () => this.loadData());
  }
});
