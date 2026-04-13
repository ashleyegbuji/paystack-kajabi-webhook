require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Use raw body for Paystack signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Health check route
app.get("/", (req, res) => {
  res.status(200).send("Paystack Kajabi webhook server is running");
});

// Verify Paystack signature
function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    console.log("PAYSTACK_SECRET_KEY is missing from environment variables");
    return false;
  }

  const hash = crypto.createHmac('sha512', secret)
    .update(req.rawBody)
    .digest('hex');

  const paystackSignature = req.headers['x-paystack-signature'];

  console.log("Paystack Signature Header:", paystackSignature);
  console.log("Generated Hash:", hash);

  return hash === paystackSignature;
}

app.post('/webhook', async (req, res) => {
  console.log("Webhook endpoint hit!");
  console.log("Headers:", req.headers);
  console.log("Body:", JSON.stringify(req.body, null, 2));

  if (!verifyPaystackSignature(req)) {
    console.log("Invalid Paystack signature");
    return res.status(400).send('Invalid signature');
  }

  const event = req.body;

  console.log("Incoming Paystack Event:");
  console.log(JSON.stringify(event, null, 2));

  console.log("Event type received:", event.event);

  if (event.event !== 'charge.success') {
    console.log("Ignored event:", event.event);
    return res.sendStatus(200);
  }

  const email = event.data.customer.email;
  const referrer = event.data.metadata?.referrer || "";
  const domain = event.data.domain || "";

  console.log("Customer Email:", email);
  console.log("Referrer:", referrer);
  console.log("Domain:", domain);

  let courseTag = null;

  // THE MASTERCLASS
  if (
    referrer.includes("vv9va-2vit") ||
    referrer.includes("simvoafrica") ||
    domain.includes("vv9va-2vit") ||
    domain.includes("simvoafrica")
  ) {
    courseTag = "THE MASTERCLASS Access";
  }
  // VIBE CODER
  else if (
    referrer.includes("u49leptunf") ||
    domain.includes("u49leptunf")
  ) {
    courseTag = "VIBE CODER Access";
  }
  else {
    console.log("Unknown payment source. No courseTag matched.");
    return res.sendStatus(200);
  }

  console.log("Matched Course Tag:", courseTag);

  if (!process.env.KAJABI_API_KEY) {
    console.log("KAJABI_API_KEY is missing from environment variables");
    return res.sendStatus(200);
  }

  try {
    const response = await axios.post(
      'https://app.kajabi.com/api/v1/people',
      {
        person: {
          email: email,
          tags: [courseTag]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KAJABI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("Kajabi Response Status:", response.status);
    console.log(`Access granted to ${email} for ${courseTag}`);
    res.sendStatus(200);

  } catch (err) {
    console.error("Kajabi API error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});