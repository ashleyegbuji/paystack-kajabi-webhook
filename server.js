require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Capture raw body for Paystack signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.get("/", (req, res) => {
  res.send("Webhook running");
});

// Verify Paystack signature
function verify(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const sig = req.headers['x-paystack-signature'];

  if (!secret || !sig) return false;

  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.rawBody)
    .digest('hex');

  return hash === sig;
}

// prevent duplicate processing (resets on restart)
const processed = new Set();

app.post("/webhook", async (req, res) => {

  // Always respond fast to Paystack
  res.sendStatus(200);

  if (!verify(req)) {
    console.log("Invalid signature");
    return;
  }

  const event = req.body;

  if (event.event !== "charge.success") return;

  const data = event.data;

  const email = data?.customer?.email;
  const ref = data?.reference;
  const metadata = data?.metadata;

  if (!email || !ref) {
    console.log("Missing email or reference");
    return;
  }

  if (processed.has(ref)) {
    console.log("Duplicate ignored:", ref);
    return;
  }

  processed.add(ref);

  const payload = {
    email,
    reference: ref,
    full_name: metadata?.full_name || "",
    phone: metadata?.phone || "",
    course: metadata?.course || ""
  };

  console.log("PAYMENT SUCCESS:", payload);

  // Send to Make.com
  try {
    await axios.post(process.env.AUTOMATION_WEBHOOK_URL, payload);
    console.log("Sent to Make automation successfully");
  } catch (err) {
    console.log("Automation failed:", err.response?.data || err.message);
  }
});

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});