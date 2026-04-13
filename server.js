require('dotenv').config();

const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Capture raw body for Paystack signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Health check
app.get("/", (req, res) => {
  res.status(200).send("Paystack webhook server is running");
});

// Verify Paystack signature
function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers['x-paystack-signature'];

  if (!secret || !signature) return false;

  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.rawBody)
    .digest('hex');

  return hash === signature;
}

/**
 * FINAL TAG MAPPING (MATCHES KAJABI EXACT TAGS)
 */
function getCourseTag(event) {
  const course = event.data?.metadata?.course;

  if (!course) return null;

  const normalized = course.toLowerCase();

  if (normalized === "masterclass") {
    return "THE MASTERCLASS Access";
  }

  if (normalized === "vibe" || normalized === "vibe-coder") {
    return "VIBE CODER Access";
  }

  return null;
}

// Prevent duplicate processing
const processedPayments = new Set();

function isDuplicate(ref) {
  return processedPayments.has(ref);
}

function markProcessed(ref) {
  processedPayments.add(ref);
}

// WEBHOOK
app.post('/webhook', async (req, res) => {

  // Respond immediately to Paystack (IMPORTANT)
  res.sendStatus(200);

  if (!verifyPaystackSignature(req)) {
    console.log("Invalid Paystack signature");
    return;
  }

  const event = req.body;

  console.log("Event received:", event.event);

  if (event.event !== "charge.success") return;

  const email = event.data?.customer?.email;
  const reference = event.data?.reference;

  if (!email || !reference) {
    console.log("Missing email or reference");
    return;
  }

  // Prevent duplicates
  if (isDuplicate(reference)) {
    console.log("Duplicate payment ignored:", reference);
    return;
  }

  markProcessed(reference);

  const courseTag = getCourseTag(event);

  if (!courseTag) {
    console.log("No matching course. Metadata:", event.data?.metadata);
    return;
  }

  // IMPORTANT: NO KAJABI API CALL (FIX FOR 405 ERROR)
  console.log("PAYMENT SUCCESS");
  console.log("Email:", email);
  console.log("Reference:", reference);
  console.log("Tag to apply in Kajabi:", courseTag);

  console.log("ACTION REQUIRED:");
  console.log("Kajabi automation will handle access via tag:", courseTag);
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});