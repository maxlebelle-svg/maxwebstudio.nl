const domainRequests = require("./services/domainRequestService");

exports.handler = async (event) => {
  if (!['GET', 'POST', 'OPTIONS'].includes(event.httpMethod)) return domainRequests.jsonResponse(405, { success: false, error: "Methode niet toegestaan." });
  if (event.httpMethod === 'OPTIONS') return domainRequests.jsonResponse(204, {});
  try {
    const context = domainRequests.contextFromEnv();
    const authUser = await domainRequests.getAuthUser(context, event);
    if (!authUser?.id) return domainRequests.jsonResponse(401, { success: false, error: "Log in om je domeinopdrachten te bekijken." });
    const customer = await domainRequests.customerForAuthUser(context, authUser.id);
    if (!customer) return domainRequests.jsonResponse(404, { success: false, error: "Je klantprofiel is nog niet gekoppeld." });
    if (event.httpMethod === 'GET') {
      return domainRequests.jsonResponse(200, { success: true, requests: await domainRequests.listRequests(context, customer.id) });
    }
    const payload = domainRequests.parsePayload(event.body);
    if (!['save', 'submit'].includes(payload.action)) return domainRequests.jsonResponse(400, { success: false, error: "Onbekende domeinactie." });
    const request = await domainRequests.saveCustomerInput(context, customer, payload, authUser);
    return domainRequests.jsonResponse(200, { success: true, request });
  } catch (error) {
    console.error('Client domain request failed', { message: error.message, status: error.status || 500 });
    return domainRequests.jsonResponse(error.status || 500, { success: false, error: error.status ? error.message : "Domeinopdracht kon niet worden verwerkt." });
  }
};
