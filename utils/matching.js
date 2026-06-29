function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function scoreMatch(supply, demand) {
  let score = 0;
  const reasons = [];

  if (normalizeText(supply.brand) && normalizeText(supply.brand) === normalizeText(demand.brand)) {
    score += 30;
    reasons.push("品牌匹配");
  }
  if (normalizeText(supply.model) && normalizeText(supply.model) === normalizeText(demand.model)) {
    score += 30;
    reasons.push("型号匹配");
  }
  if (normalizeText(supply.gpu) && normalizeText(demand.gpu) && normalizeText(supply.gpu) === normalizeText(demand.gpu)) {
    score += 20;
    reasons.push("GPU匹配");
  }

  const supplyQty = Number(supply.quantity) || 0;
  const demandQty = Number(demand.quantity) || 0;
  if (supplyQty > 0 && demandQty > 0 && supplyQty >= demandQty) {
    score += 10;
    reasons.push("数量满足");
  }

  if (normalizeText(supply.location) && normalizeText(demand.region) && normalizeText(supply.location).includes(normalizeText(demand.region))) {
    score += 10;
    reasons.push("区域接近");
  }

  const supplyPrice = Number(supply.price) || 0;
  const budgetMax = Number(demand.budgetMax) || 0;
  if (supplyPrice > 0 && budgetMax > 0 && supplyPrice <= budgetMax) {
    score += 10;
    reasons.push("预算可覆盖");
  }

  return {
    score,
    reasons,
    matched: score >= 50
  };
}

function findMatchesForInventory(supply, demands) {
  return (demands || [])
    .map((demand) => {
      const result = scoreMatch(supply, demand);
      return {
        supplyId: supply.id,
        demandId: demand.id,
        score: result.score,
        reasons: result.reasons,
        matched: result.matched,
        supplyTitle: supply.displayTitle || supply.title,
        demandTitle: demand.title,
        supplyOwnerId: supply.creatorId,
        demandOwnerId: demand.creatorId
      };
    })
    .filter((item) => item.matched)
    .sort((a, b) => b.score - a.score);
}

function findMatchesForDemand(demand, supplies) {
  return (supplies || [])
    .map((supply) => {
      const result = scoreMatch(supply, demand);
      return {
        supplyId: supply.id,
        demandId: demand.id,
        score: result.score,
        reasons: result.reasons,
        matched: result.matched,
        supplyTitle: supply.displayTitle || supply.title,
        demandTitle: demand.title,
        supplyOwnerId: supply.creatorId,
        demandOwnerId: demand.creatorId
      };
    })
    .filter((item) => item.matched)
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  findMatchesForInventory,
  findMatchesForDemand
};