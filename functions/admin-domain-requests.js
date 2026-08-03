const { verifyAdmin } = require("./_admin-auth");
const domainRequests = require("./services/domainRequestService");

exports.handler = async (event) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return domainRequests.jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
  const adminCheck = await verifyAdmin(event, domainRequests.jsonResponse, {
    module: 'domain_center', action: event.httpMethod === 'GET' ? 'read' : 'write',
    allowedRoles: ['super_admin', 'admin', 'sales_manager'], allowedStatuses: ['active', 'invited'],
  });
  if (!adminCheck.success) return adminCheck.response;
  try {
    const context = domainRequests.contextFromEnv();
    const input = event.httpMethod === 'POST' ? domainRequests.parsePayload(event.body) : (event.queryStringParameters || {});
    const relationshipType = domainRequests.cleanText(input.relationshipType).toLowerCase();
    const customerId = domainRequests.cleanText(input.customerId || (relationshipType === 'customer' ? input.relationshipId : ''));
    if (event.httpMethod === 'GET') {
      if (relationshipType === 'lead') return domainRequests.jsonResponse(200, { success: true, requests: [], conversionRequired: true });
      if (!domainRequests.isUuid(customerId)) return domainRequests.jsonResponse(400, { success: false, error: "Selecteer eerst een klant." });
      return domainRequests.jsonResponse(200, { success: true, requests: await domainRequests.listRequests(context, customerId) });
    }
    const action = domainRequests.cleanText(input.action);
    if (action === 'create') {
      const request = await domainRequests.createRequest(context, { ...input, customerId }, adminCheck.admin);
      return domainRequests.jsonResponse(201, { success: true, request });
    }
    if (action === 'update_status') {
      const request = await domainRequests.updateAdminRequest(context, { ...input, customerId }, adminCheck.admin);
      return domainRequests.jsonResponse(200, { success: true, request });
    }
    if (action === 'reveal_transfer_code') {
      const transferCode = await domainRequests.revealTransferCode(context, { ...input, customerId }, adminCheck.admin);
      return domainRequests.jsonResponse(200, { success: true, transferCode });
    }
    return domainRequests.jsonResponse(400, { success: false, error: "Onbekende domeinactie." });
  } catch (error) {
    console.error('Admin domain request failed', { message: error.message, status: error.status || 500 });
    return domainRequests.jsonResponse(error.status || 500, { success: false, error: error.status ? error.message : "Domeinopdracht kon niet worden verwerkt." });
  }
};
