const DEFAULT_PROGRESSIVE_TIERS = Object.freeze([
  Object.freeze({ upToCents: 200000, rateBps: 2000 }),
  Object.freeze({ upToCents: 500000, rateBps: 2500 }),
  Object.freeze({ upToCents: 1000000, rateBps: 3000 }),
  Object.freeze({ upToCents: null, rateBps: 3500 }),
]);

function calculateCommissionCents(basisCents, options = {}) {
  const amount = integerCents(basisCents);
  if (amount <= 0) return 0;
  const tiers = normalizeTiers(options.tiers || DEFAULT_PROGRESSIVE_TIERS);
  return options.calculationMethod === 'retroactive_tier'
    ? retroactiveCommission(amount, tiers)
    : progressiveCommission(amount, tiers);
}

function progressiveCommission(amount, tiers) {
  let previousLimit = 0;
  let commission = 0;
  for (const tier of tiers) {
    const limit = tier.upToCents == null ? amount : Math.min(amount, tier.upToCents);
    const slice = Math.max(0, limit - previousLimit);
    commission += Math.round(slice * tier.rateBps / 10000);
    previousLimit = tier.upToCents == null ? amount : tier.upToCents;
    if (amount <= previousLimit) break;
  }
  return commission;
}

function retroactiveCommission(amount, tiers) {
  const tier = tiers.find((candidate) => candidate.upToCents == null || amount <= candidate.upToCents) || tiers[tiers.length - 1];
  return Math.round(amount * tier.rateBps / 10000);
}

function normalizeTiers(input) {
  if (!Array.isArray(input) || !input.length) throw new TypeError('Commission tiers are required.');
  let previous = 0;
  return input.map((tier, index) => {
    const upToCents = tier.upToCents == null ? null : integerCents(tier.upToCents);
    const rateBps = Number(tier.rateBps);
    if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new TypeError('Invalid commission rate.');
    if (upToCents != null && upToCents <= previous) throw new TypeError('Commission tier limits must increase.');
    if (upToCents == null && index !== input.length - 1) throw new TypeError('Only the final tier can be open-ended.');
    if (upToCents != null) previous = upToCents;
    return { upToCents, rateBps };
  });
}

function integerCents(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new TypeError('Commission amounts must be safe integer cents.');
  return amount;
}

module.exports = { DEFAULT_PROGRESSIVE_TIERS, calculateCommissionCents, normalizeTiers };
