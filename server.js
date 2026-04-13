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
  res.status(200).send("Webhook server running");
});

// Verify Paystack signature
function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) return false;

  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.rawBody)
    .digest('hex');

  return hash === req.headers['x-paystack-signature'];
}

// BEST ROUTING LOGIC
function getCourseTag(event) {
  const reference = (event.data.reference || "").toLowerCase();

  if (reference.includes("vv9va-2vit") || reference.includes("simvoafrica")) {
    return "THE MASTERCLASS Access";
  }

  if (reference.includes("u49leptunf")) {
    return "VIBE CODER Access";
  }

  return null;
}

app.post('/webhook', async (req, res) => {

  // CRITICAL: respond immediately to Paystack
  res.sendStatus(200);

  try {
    if (!verifyPaystackSignature(req)) {
      console.log("Invalid signature");
      return;
    }

    const event = req.body;

    if (event.event !== "charge.success") return;

    const email = event.data.customer.email;
    const reference = event.data.reference;

    const courseTag = getCourseTag(event);

    if (!courseTag) {
      console.log("No matching course for reference:", reference);
      return;
    }

    console.log("Processing:", email, courseTag);

    // async Kajabi call (DO NOT block webhook)
    axios.post(
      "https://app.kajabi.com/api/v1/people",
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
    )
    .then(() => {
      console.log("Kajabi success:", email);
    })
    .catch((err) => {
      console.log("Kajabi error:", err.response?.data || err.message);
    });

  } catch (err) {
    console.log("Webhook error:", err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});