require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Capture raw body (required for Paystack signature verification)
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

  if (!secret) {
    console.log("Missing PAYSTACK_SECRET_KEY");
    return false;
  }

  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.rawBody)
    .digest('hex');

  return hash === req.headers['x-paystack-signature'];
}

// COURSE ROUTING (FINAL LOGIC)
function getCourse(event) {
  const course = event.data.metadata?.course;

  if (course === "masterclass") {
    return "THE MASTERCLASS Access";
  }

  if (course === "vibe") {
    return "VIBE CODER Access";
  }

  return null;
}

// WEBHOOK
app.post('/webhook', async (req, res) => {

  // Always respond fast (prevents Paystack retries)
  res.sendStatus(200);

  if (!verifyPaystackSignature(req)) {
    console.log("Invalid Paystack signature");
    return;
  }

  const event = req.body;

  console.log("Event received:", event.event);

  // Only handle successful payments
  if (event.event !== "charge.success") return;

  const email = event.data.customer.email;
  const courseTag = getCourse(event);

  if (!courseTag) {
    console.log("No course found in metadata");
    return;
  }

  try {
    await axios.post(
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
    );

    console.log("Access granted:", email, courseTag);

  } catch (err) {
    console.log("Kajabi error:", err.response?.data || err.message);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});