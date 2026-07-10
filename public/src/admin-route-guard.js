import { requireAuth } from "./services/routeGuardService.js";

function currentAdminPageName() {
  const fileName = String(window.location?.pathname || "").split("/").pop() || "";
  return fileName.replace(/\.html$/i, "") || "admin-dashboard";
}

const decision = requireAuth({
  pageName: currentAdminPageName(),
  allowDemo: false,
  mode: "hard",
});

window.maxwebstudioAdminGuardDecision = decision;
document.documentElement.dataset.adminAccess = decision.allowed ? "allowed" : "blocked";
