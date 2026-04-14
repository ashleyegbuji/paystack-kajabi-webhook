require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Capture raw body (required for Paystack signature verification)
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Health check
app.get("/", (req, res) => {
  res.status(200).send("Paystack Kajabi webhook server is running");
});

// Verify Paystack signature
function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers["x-paystack-signature"];

  if (!secret) {
    console.log("Missing PAYSTACK_SECRET_KEY in env");
    return false;
  }

  if (!signature) {
    console.log("Missing x-paystack-signature header");
    return false;
  }

  const hash = crypto
    .createHmac("sha512", secret)
    .update(req.rawBody)
    .digest("hex");

  return hash === signature;
}

// Map metadata course to Kajabi tag
function getCourseTag(event) {
  const course = event.data?.metadata?.course;

  if (!course) return null;

  const normalized = course.toLowerCase();

  if (normalized === "masterclass" || normalized === "masterclass_nysc") {
    return "THE MASTERCLASS Access";
  }

  if (normalized === "vibe" || normalized === "vibe-coder") {
    return "VIBE CODER Access";
  }

  return null;
}

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  // Respond immediately to Paystack
  res.sendStatus(200);

  // Verify signature
  if (!verifyPaystackSignature(req)) {
    console.log("Invalid Paystack signature");
    return;
  }

  const event = req.body;

  console.log("Event received:", event.event);

  // Only process successful payments
  if (event.event !== "charge.success") return;

  const email = event.data?.customer?.email;
  const reference = event.data?.reference;
  const courseTag = getCourseTag(event);

  console.log("Payment received");
  console.log("Email:", email);
  console.log("Reference:", reference);
  console.log("Metadata:", event.data?.metadata);

  if (!email || !reference) {
    console.log("Missing email or reference");
    return;
  }

  if (!courseTag) {
    console.log("No matching courseTag from metadata");
    return;
  }

  console.log("Assigning Kajabi Tag:", courseTag);

  if (!process.env.KAJABI_API_KEY) {
    console.log("Missing KAJABI_API_KEY in env");
    return;
  }

  try {
    const response = await axios.post(
      "https://app.kajabi.com/api/v1/people",
      {
        person: {
          email: email,
          tags: [courseTag],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.KAJABI_API_KEY}`,
          "Cotnent-Type": "application/json",
        },
      }
    );

    console.log("Kajabi success:", response.status);
    console.log("Kajabi response:", response.data);

  } catch (err) {
    console.log("Kajabi FAILED");
    console.log("Status:", err.response?.status);
    console.log("Data:", err.response?.data || err.message);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});