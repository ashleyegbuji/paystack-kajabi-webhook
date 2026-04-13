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
 * FINAL TAG MAPPING (MATCHES YOUR KAJABI TAGS EXACTLY)
 */
function getCourseTag(event) {
  const course = event.data?.metadata?.course;

  if (!course) return null;

  const normalized = course.toLowerCase();

  // MASTERCLASS
  if (normalized === "masterclass") {
    return "THE MASTERCLASS Access";
  }

  // VIBE CODER
  if (normalized === "vibe" || normalized === "vibe-coder") {
    return "VIBE CODER Access";
  }

  return null;
}

// Prevent duplicate webhook processing
const processedPayments = new Set();

function isDuplicate(ref) {
  return processedPayments.has(ref);
}

function markProcessed(ref) {
  processedPayments.add(ref);
}

// WEBHOOK
app.post('/webhook', async (req, res) => {

  // Respond immediately to Paystack (VERY IMPORTANT)
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
    console.log("No matching Kajabi tag. Metadata:", event.data?.metadata);
    return;
  }

  console.log("Assigning tag:", courseTag, "to", email);

  try {
    await axios.post(
      "https://kajabi.com/api/v2/people",
      {
        person: {
          email,
          tags: [courseTag]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KAJABI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Access granted successfully:", email, courseTag);

  } catch (err) {
    console.log("Kajabi error:", err.response?.data || err.message);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});