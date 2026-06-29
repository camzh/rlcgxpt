const INVENTORY_STATUS = {
  ON_SALE: "on_sale",
  FOLLOWING: "following",
  SOLD: "sold",
  OFFLINE: "offline"
};

const SOURCE_TYPES = {
  COMPANY: "company",
  OWN: "own",
  SHARED: "shared",
  SPOT: "spot",
  FUTURES: "futures"
};

const MARKET_TYPES = {
  INBOUND: "inbound",
  DOMESTIC: "domestic",
  EXPORT: "export"
};

const REVIEW_STATUS = {
  AUTO: "auto",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
};

const BUSINESS_TYPES = {
  SALE: "sale",
  RENT: "rent",
  BOTH: "both"
};

const BUSINESS_TYPE_OPTIONS = [
  { label: "出售", value: BUSINESS_TYPES.SALE },
  { label: "租赁", value: BUSINESS_TYPES.RENT },
  { label: "可租可售", value: BUSINESS_TYPES.BOTH }
];

const RENTAL_PRICE_OPTIONS = [
  { key: "oneYearFull", label: "一年全包", defaultPrice: "3.2" },
  { key: "twoYearFull", label: "二年全包", defaultPrice: "2.8" },
  { key: "threeYearFull", label: "三年全包", defaultPrice: "2.5" },
  { key: "oneYearMove", label: "一年搬迁", defaultPrice: "2.8" },
  { key: "twoYearMove", label: "二年搬迁", defaultPrice: "2.8" },
  { key: "threeYearMove", label: "三年搬迁", defaultPrice: "2.5" }
];

function buildDefaultRentalPrices() {
  return RENTAL_PRICE_OPTIONS.reduce((result, item) => {
    result[item.key] = item.defaultPrice;
    return result;
  }, {});
}

const PRICE_UNITS = {
  CNY_TEN_THOUSAND: "cny_10k",
  CNY_TEN_THOUSAND_PIECE: "cny_10k_piece",
  CNY_TEN_THOUSAND_STRIP: "cny_10k_strip",
  USD: "usd",
  USD_PIECE: "usd_piece",
  USD_STRIP: "usd_strip"
};

const PRICE_UNIT_OPTIONS = [
  { label: "万元/台", value: PRICE_UNITS.CNY_TEN_THOUSAND },
  { label: "万元/片", value: "cny_10k_piece" },
  { label: "万元/条", value: "cny_10k_strip" },
  { label: "美金/台", value: PRICE_UNITS.USD },
  { label: "美金/片", value: "usd_piece" },
  { label: "美金/条", value: "usd_strip" }
];

function normalizePriceUnit(value) {
  const text = String(value || "").trim().toLowerCase();
  const isUsd = text.includes("usd") || text.includes("us$") || text.includes("$") || text.includes("美金") || text.includes("美元");
  if (text.includes("strip") || text.includes("条")) {
    return isUsd ? PRICE_UNITS.USD_STRIP : PRICE_UNITS.CNY_TEN_THOUSAND_STRIP;
  }
  if (text.includes("piece") || text.includes("片")) {
    return isUsd ? PRICE_UNITS.USD_PIECE : PRICE_UNITS.CNY_TEN_THOUSAND_PIECE;
  }
  if (isUsd) {
    return PRICE_UNITS.USD;
  }
  return PRICE_UNITS.CNY_TEN_THOUSAND;
}

function getPriceUnitLabel(value, monthly = false) {
  const unit = normalizePriceUnit(value);
  if (unit === PRICE_UNITS.USD || unit === PRICE_UNITS.USD_PIECE || unit === PRICE_UNITS.USD_STRIP) {
    const suffix = unit === PRICE_UNITS.USD ? "台" : (unit === PRICE_UNITS.USD_PIECE ? "片" : "条");
    return monthly ? `美金/月/${suffix}` : `美金/${suffix}`;
  }
  if (unit === PRICE_UNITS.CNY_TEN_THOUSAND_PIECE) {
    return monthly ? "万/月/片" : "万元/片";
  }
  if (unit === PRICE_UNITS.CNY_TEN_THOUSAND_STRIP) {
    return monthly ? "万/月/条" : "万元/条";
  }
  return monthly ? "万/月/台" : "万元/台";
}

function getPriceUnitPickerLabel(value) {
  const unit = normalizePriceUnit(value);
  const found = PRICE_UNIT_OPTIONS.find((item) => item.value === unit);
  return found ? found.label : PRICE_UNIT_OPTIONS[0].label;
}
const STATUS_META = {
  [INVENTORY_STATUS.ON_SALE]: {
    text: "在售",
    className: "status-onsale"
  },
  [INVENTORY_STATUS.FOLLOWING]: {
    text: "跟进中",
    className: "status-following"
  },
  [INVENTORY_STATUS.SOLD]: {
    text: "已完成",
    className: "status-sold"
  },
  [INVENTORY_STATUS.OFFLINE]: {
    text: "已下架",
    className: "status-offline"
  }
};

const DEFAULT_ENUM_OPTIONS = {
  sourceType: [
    { label: "公司货源", value: SOURCE_TYPES.COMPANY },
    { label: "我的货源", value: SOURCE_TYPES.OWN },
    { label: "共享给我", value: SOURCE_TYPES.SHARED }
  ],
  marketType: [
    { label: "到港", value: MARKET_TYPES.INBOUND },
    { label: "国内", value: MARKET_TYPES.DOMESTIC },
    { label: "外贸", value: MARKET_TYPES.EXPORT }
  ],
  followStatus: [
    { label: "无", value: "none" },
    { label: "跟进中", value: INVENTORY_STATUS.FOLLOWING },
    { label: "已完成", value: INVENTORY_STATUS.SOLD }
  ]
};

const CATEGORY_OPTIONS = [
  { label: "整机服务器", value: "整机服务器" },
  { label: "CPU", value: "CPU" },
  { label: "网卡", value: "网卡" },
  { label: "模组", value: "模组" },
  { label: "机头", value: "机头" },
  { label: "SSD固态", value: "SSD固态" },
  { label: "企业机械盘", value: "企业机械盘" },
  { label: "内存", value: "内存" },
  { label: "GPU", value: "GPU" }
];

const CONDITION_OPTIONS = [
  { label: "拆机", value: "拆机" },
  { label: "全新", value: "全新" },
  { label: "二手", value: "二手" }
];

const LOG_ACTIONS = {
  CREATE: "create",
  UPDATE: "update",
  MARK_FOLLOWING: "mark_following",
  MARK_SOLD: "mark_sold",
  MARK_OFFLINE: "mark_offline",
  DELETE: "delete",
  RESTORE: "restore"
};

module.exports = {
  INVENTORY_STATUS,
  STATUS_META,
  LOG_ACTIONS,
  SOURCE_TYPES,
  MARKET_TYPES,
  REVIEW_STATUS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_OPTIONS,
  RENTAL_PRICE_OPTIONS,
  PRICE_UNITS,
  PRICE_UNIT_OPTIONS,
  buildDefaultRentalPrices,
  normalizePriceUnit,
  getPriceUnitLabel,
  getPriceUnitPickerLabel,
  DEFAULT_ENUM_OPTIONS,
  CATEGORY_OPTIONS,
  CONDITION_OPTIONS
};
