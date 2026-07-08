const { sendTrackedEmail } = require("./services/resendMailService");

async function sendEmail(options = {}) {
  return sendTrackedEmail(options);
}

module.exports = { sendEmail, sendTrackedEmail };
