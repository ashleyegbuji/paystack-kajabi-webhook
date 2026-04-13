require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.get("/", (req, res) => {
  res.status(200).send("Webhook running");
});

function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) return false;

  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.rawBody)
    .digest('hex');

  return hash === req.headers['x-paystack-signature'];
}

/* -----------------------------
   COURSE ROUTING LOGIC (FIXED)
------------------------------*/
function getCourse(event) {
  const ref = (event.data.reference || "").toLowerCase();

  // MASTERCLASS
  if (
    ref.includes("vv9va-2vit") ||
    ref.includes("simvoafrica")
  ) {
    return "THE MASTERCLASS Access";
  }

  // VIBE CODER
  if (ref.includes("u49leptunf")) {
    return "VIBE CODER Access";
  }

  return null;
}

app.post('/webhook', async (req, res) => {

  // Always respond immediately to prevent Paystack retries
  res.sendStatus(200);

  if (!verifyPaystackSignature(req)) {
    console.log("Invalid Paystack signature");
    return;
  }

  const event = req.body;

  if (event.event !== "charge.success") return;

  const email = event.data.customer.email;
  const courseTag = getCourse(event);

  if (!courseTag) {
    console.log("No matching course for reference:", event.data.reference);
    return;
  }

  try {
    await axios.post(
      "https://app.kajabi.com/api/v1/people",
      {
        person: {
          email: email,
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

    console.log("Granted access:", email, courseTag);

  } catch (err) {
    console.log("Kajabi error:", err.response?.data || err.message);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});