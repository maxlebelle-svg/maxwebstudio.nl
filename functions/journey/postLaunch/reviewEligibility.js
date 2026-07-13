function resolveReviewEligibility(input = {}, options = {}) {
  const now = date(options.now || Date.now()); const liveAt = date(input.liveAt); const days = bounded(options.minimumDays ?? process.env.JOURNEY_REVIEW_ELIGIBILITY_DAYS, 7, 1, 90);
  const earliest = liveAt ? new Date(liveAt.getTime() + days * 86400000) : null;
  const base = { eligible: false, state: "not_eligible", earliestEligibleAt: earliest?.toISOString() || null, websiteHealthy: input.overallResult === "healthy", openInternalIssue: input.internalActionRequired === true, journeyCompleted: input.journeyCompleted === true, reviewAlreadyRequested: input.reviewAlreadyRequested === true, reviewAlreadyReceived: input.reviewAlreadyReceived === true };
  if (base.reviewAlreadyReceived) return { ...base, state: "blocked", reasonCode: "review_already_received" };
  if (base.reviewAlreadyRequested) return { ...base, state: "blocked", reasonCode: "review_already_requested" };
  if (!input.hasPostLaunchCheck) return { ...base, reasonCode: "post_launch_check_missing" };
  if (!base.websiteHealthy || base.openInternalIssue) return { ...base, state: "blocked", reasonCode: "website_attention_open" };
  if (!base.journeyCompleted) return { ...base, reasonCode: "journey_not_completed" };
  if (!earliest || now < earliest) return { ...base, state: "eligible_later", reasonCode: "minimum_period_not_elapsed" };
  return { ...base, eligible: true, state: "eligible", reasonCode: "review_eligible" };
}
function date(value) { const result = new Date(value || 0); return Number.isNaN(result.getTime()) ? null : result; }
function bounded(value, fallback, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback; }
module.exports = { resolveReviewEligibility };
