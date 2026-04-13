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

// Scalable course mapping (BEST PRACTICE)
const courseMap = {
  masterclass: "THE MASTERCLASS Access",
  masterclass_nysc: "THE MASTERCLASS Access",
  vibe: "VIBE CODER Access",
  "vibe-coder": "VIBE CODER Access"
};

function getCourseTag(event) {
  const course = event.data?.metadata?.course;

  if (!course) return null;

  return courseMap[course.toLowerCase()] || null;
}

// Prevent duplicate processing (simple memory cache)
const processedPayments = new Set();

function isDuplicate(ref) {
  return processedPayments.has(ref);
}

function markProcessed(ref) {
  processedPayments.add(ref);
}

// WEBHOOK
app.post('/webhook', async (req, res) => {

  // Always respond fast to Paystack
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

  // Prevent duplicate processing
  if (isDuplicate(reference)) {
    console.log("Duplicate ignored:", reference);
    return;
  }

  markProcessed(reference);

  const courseTag = getCourseTag(event);

  if (!courseTag) {
    console.log("No matching course. Metadata:", event.data?.metadata);
    return;
  }

  // FINAL SUCCESS LOGIC
  console.log("Payment received");
  console.log("Email:", email);
  console.log("Reference:", reference);
  console.log("Assigning tag:", courseTag);

  /**
   * IMPORTANT:
   * Kajabi API was removed due to 405 errors.
   * Use Kajabi automation (tags → access rules) instead.
   */
  console.log("Send to Kajabi automation via tag:", courseTag);
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});