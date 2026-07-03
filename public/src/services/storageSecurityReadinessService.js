const STORAGE_BUCKETS = Object.freeze([
  {
    id: "customer-files",
    label: "Customer files",
    purpose: "Klantbestanden zoals logo's, foto's, teksten en projectdocumenten.",
    privacy: "private",
    productionCritical: true,
  },
  {
    id: "website-assets",
    label: "Website assets",
    purpose: "Websitebeelden, geoptimaliseerde assets en later AI-gegenereerde website-assets.",
    privacy: "private_by_default",
    productionCritical: true,
  },
  {
    id: "contracts",
    label: "Contracts",
    purpose: "Contracten, akkoorddocumenten en juridische bijlagen.",
    privacy: "private",
    productionCritical: true,
  },
  {
    id: "invoices",
    label: "Invoices",
    purpose: "Factuur-PDF's en betaalgerelateerde documenten.",
    privacy: "private",
    productionCritical: true,
  },
  {
    id: "ai-assets",
    label: "AI assets",
    purpose: "Toekomstige AI-briefings, conceptbeelden en websitegenerator-assets.",
    privacy: "private",
    productionCritical: false,
  },
  {
    id: "demo-assets",
    label: "Demo assets",
    purpose: "Publieke demo- en sales-assets zonder echte klantdata.",
    privacy: "public_or_private_demo_only",
    productionCritical: false,
  },
  {
    id: "internal-documents",
    label: "Internal documents",
    purpose: "Interne notities, overdrachten, auditbijlagen en operationele documenten.",
    privacy: "private_internal",
    productionCritical: true,
  },
]);

const ROLE_ACCESS_MATRIX = Object.freeze([
  {
    role: "customer",
    canUpload: ["customer-files"],
    canDownload: ["customer-files"],
    restrictions: "Alleen eigen customer/project/website context; geen contracts, invoices of internal-documents tenzij server-side expliciet toegestaan.",
  },
  {
    role: "admin",
    canUpload: ["customer-files", "website-assets", "contracts", "invoices", "internal-documents"],
    canDownload: ["customer-files", "website-assets", "contracts", "invoices", "internal-documents"],
    restrictions: "Alle acties via server-side endpoint met audit event.",
  },
  {
    role: "support",
    canUpload: ["customer-files"],
    canDownload: ["customer-files", "website-assets"],
    restrictions: "Geen finance, contracts of internal-documents zonder hogere rol.",
  },
  {
    role: "developer",
    canUpload: ["website-assets", "demo-assets"],
    canDownload: ["website-assets", "demo-assets"],
    restrictions: "Geen klantdocumenten tenzij gekoppeld aan support/admin proces.",
  },
  {
    role: "sales_partner",
    canUpload: ["demo-assets"],
    canDownload: ["demo-assets", "website-assets"],
    restrictions: "Geen echte klantbestanden of finance-bestanden.",
  },
  {
    role: "demo_user",
    canUpload: [],
    canDownload: ["demo-assets"],
    restrictions: "Alleen demo data; geen echte klantdata.",
  },
]);

const FILE_TYPE_POLICY = Object.freeze({
  allowedExtensions: ["jpg", "jpeg", "png", "webp", "pdf", "docx", "txt", "md", "csv"],
  blockedExtensions: ["exe", "dmg", "pkg", "sh", "bat", "cmd", "js", "html", "php"],
  maxUploadMb: 10,
  maxFilesPerRequest: 5,
  virusScan: "future_required_before_production_customer_uploads",
});

const SIGNED_URL_POLICY = Object.freeze({
  downloadTtlSeconds: 300,
  uploadTtlSeconds: 300,
  directPublicUrls: "blocked_for_private_buckets",
  generatedBy: "server_side_endpoint_only",
  auditRequired: true,
});

const MAX_AI_FILE_POLICY = Object.freeze([
  ["Bestand uitleggen", "allowed_with_customer_context"],
  ["Bestand samenvatten", "allowed_with_masking_and_consent"],
  ["Bestand analyseren", "allowed_for_safe_types_after_server_side_review"],
  ["Bestand publiceren", "blocked_without_human_approval"],
  ["Bestand verwijderen", "blocked"],
  ["Signed URL delen", "blocked"],
  ["Factuur/contract juridisch interpreteren", "support_only_no_final_decision"],
]);

export function getStorageSecurityReadiness() {
  const blockers = [
    "Supabase Storage buckets nog niet als canonical staging migration uitgevoerd.",
    "Upload/download endpoints nog niet als nieuwe productieflow gebouwd.",
    "Server-side audit logging voor file events nog niet actief.",
    "Storage RLS/customer isolation nog niet bewezen voor alle buckets.",
    "Backup/restore voor Storage nog niet getest.",
  ];

  return {
    status: "FOUNDATION_READY",
    sprint: "3B",
    productionStorage: "blocked",
    uploadsEnabled: false,
    downloadsEnabled: false,
    buckets: [...STORAGE_BUCKETS],
    roleAccess: [...ROLE_ACCESS_MATRIX],
    fileTypePolicy: { ...FILE_TYPE_POLICY },
    signedUrlPolicy: { ...SIGNED_URL_POLICY },
    maxAiFilePolicy: [...MAX_AI_FILE_POLICY],
    blockers,
    nextActions: [
      "Review bucketstrategie.",
      "Maak staging-only Storage migration/policy draft.",
      "Valideer signed URL flow op staging.",
      "Koppel file events aan server-side audit logging.",
      "Test customer isolation voor upload en download.",
    ],
  };
}

export function getStorageBucketSummary() {
  return STORAGE_BUCKETS.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    privacy: bucket.privacy,
    productionCritical: bucket.productionCritical,
  }));
}

export function getStorageRoleAccessMatrix() {
  return [...ROLE_ACCESS_MATRIX];
}

export function getMaxAiFilePolicy() {
  return [...MAX_AI_FILE_POLICY];
}
