import { getApprovalCoverage, getGoNoGoReasons } from "./releaseDecisionService.js";

const RELEASE_ROLES = Object.freeze([
  {
    role: "developer",
    responsibilities: ["code voorbereiden", "staging validatie uitvoeren", "evidence aanleveren"],
    cannot: ["productie vrijgeven zonder approval", "eigen release zelfstandig goedkeuren"],
  },
  {
    role: "admin",
    responsibilities: ["business impact beoordelen", "klantcommunicatie voorbereiden", "release window akkoord geven"],
    cannot: ["security blockers negeren", "rollback overslaan"],
  },
  {
    role: "release_approver",
    responsibilities: ["GO/NO-GO besluit nemen", "evidence controleren", "rollback approval bevestigen"],
    cannot: ["goedkeuren zonder verplichte evidence"],
  },
  {
    role: "support",
    responsibilities: ["bekende issues monitoren", "klantimpact signaleren", "supportnotities voorbereiden"],
    cannot: ["deployment starten", "production config wijzigen"],
  },
  {
    role: "production_operator",
    responsibilities: ["goedgekeurde release uitvoeren", "rollback uitvoeren na approval", "post-release checks registreren"],
    cannot: ["scope wijzigen tijdens execution", "zonder GO deployen"],
  },
]);

const RELEASE_FLOW = Object.freeze(["development", "staging", "evidence", "approval", "production"]);

const REQUIRED_EVIDENCE = Object.freeze([
  "staging tests",
  "RLS validatie",
  "write validatie",
  "security checks",
  "rollback bevestigd",
  "release checklist",
  "deployment blockers",
]);

const AUTOMATIC_NO_GO = Object.freeze([
  "open blocker",
  "mislukte stagingtest",
  "ontbrekende audit evidence",
  "ontbrekende rollback approval",
  "ontbrekende release approval",
  "productieconfig mismatch",
  "secrets of API keys in diff/logs",
  "customer isolation niet bewezen",
]);

const ROLLBACK_GOVERNANCE = Object.freeze({
  allowedStarters: ["release_approver", "production_operator"],
  requiredWhen: [
    "klantdata zichtbaar voor verkeerde klant",
    "RLS blokkeert kritieke flows",
    "facturen/offertes tonen verkeerde data",
    "production deploy veroorzaakt kritieke fout",
    "rollback is expliciet gevraagd door release approver",
  ],
  evidence: [
    "release id/commit",
    "incidenttijd",
    "impact",
    "rollbackbesluit",
    "uitgevoerde rollbackstappen",
    "post-rollback checks",
  ],
});

const MAX_AI_RELEASE_EXPLANATIONS = Object.freeze([
  ["Waarom mag dit nog niet live?", "Max legt uit welke blocker/evidence ontbreekt en welke veilige volgende stap nodig is."],
  ["Waarom is deployment geblokkeerd?", "Max verwijst naar GO/NO-GO, stagingresultaten, rollbackstatus en approvalstatus."],
  ["Waarom is menselijke goedkeuring nodig?", "Max legt uit dat releases klantdata, facturen, security of productieconfiguratie kunnen raken."],
  ["Wat kan Max wel doen?", "Max kan een release-samenvatting maken of een checklist klaarzetten, maar geen deployment starten."],
]);

function safeApprovalCoverage() {
  try {
    return getApprovalCoverage();
  } catch {
    return {
      total: 0,
      approvedOrNotApplicable: 0,
      evidenceComplete: 0,
      percentage: 0,
      evidencePercentage: 0,
    };
  }
}

function safeGoNoGoReasons() {
  try {
    return getGoNoGoReasons();
  } catch {
    return {
      decision: "NO-GO",
      primaryReason: "Release governance kan blockers nog niet lezen.",
      missingEvidence: [],
      rejected: [],
      inReview: [],
      pending: [],
      nextActions: [],
    };
  }
}

export function getReleaseGovernanceReadiness() {
  const approvalCoverage = safeApprovalCoverage();
  const goNoGo = safeGoNoGoReasons();
  const openBlockerCount = (
    goNoGo.missingEvidence.length
    + goNoGo.rejected.length
    + goNoGo.inReview.length
    + goNoGo.pending.length
  );

  return {
    status: "FOUNDATION_READY",
    sprint: "3C",
    releaseFlow: [...RELEASE_FLOW],
    roles: [...RELEASE_ROLES],
    requiredEvidence: [...REQUIRED_EVIDENCE],
    automaticNoGo: [...AUTOMATIC_NO_GO],
    rollbackGovernance: {
      ...ROLLBACK_GOVERNANCE,
      allowedStarters: [...ROLLBACK_GOVERNANCE.allowedStarters],
      requiredWhen: [...ROLLBACK_GOVERNANCE.requiredWhen],
      evidence: [...ROLLBACK_GOVERNANCE.evidence],
    },
    maxAiExplanations: [...MAX_AI_RELEASE_EXPLANATIONS],
    decision: goNoGo.decision || "NO-GO",
    primaryReason: goNoGo.primaryReason,
    approvalCoverage,
    openBlockerCount,
    productionDeployments: "blocked",
    deploymentAutomation: "not_built",
  };
}

export function getReleaseGovernanceRoles() {
  return [...RELEASE_ROLES];
}

export function getReleaseGovernanceNoGoRules() {
  return [...AUTOMATIC_NO_GO];
}

export function getMaxAiReleaseGovernanceExplanations() {
  return [...MAX_AI_RELEASE_EXPLANATIONS];
}
