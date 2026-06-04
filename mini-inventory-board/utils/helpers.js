const { STATUS_META, INVENTORY_STATUS } = require("./constants");

function formatDateTime(input) {
  const date = input ? new Date(input) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getStatusView(status) {
  return STATUS_META[status] || STATUS_META[INVENTORY_STATUS.ON_SALE];
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function pickVisibleFields(item) {
  return {
    id: item.id,
    displayTitle: item.displayTitle || item.title,
    model: item.model,
    brand: item.brand,
    configSummary: item.configSummary,
    quantity: item.quantity,
    location: item.location,
    status: item.status,
    statusText: getStatusView(item.status).text,
    displayTags: item.displayTags || [],
    displayPriority: item.displayPriority || 0,
    updatedAt: item.updatedAt
  };
}

module.exports = {
  formatDateTime,
  getStatusView,
  clone,
  pickVisibleFields
};
