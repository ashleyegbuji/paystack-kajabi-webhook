require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Capture raw body for Paystack signature verification
 */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.status(200).send("Paystack → Kajabi webhook running");
});

/**
 * Verify Paystack signature
 */
function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers["x-paystack-signature"];

  if (!secret || !signature) return false;

  const hash = crypto
    .createHmac("sha512", secret)
    .update(req.rawBody)
    .digest("hex");

  return hash === signature;
}

/**
 * MAP COURSE → KAJABI TAG
 */
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

/**
 * WEBHOOK
 */
app.post("/webhook", async (req, res) => {
  // ALWAYS respond fast to Paystack
  res.sendStatus(200);

  if (!verifyPaystackSignature(req)) {
    console.log("❌ Invalid Paystack signature");
    return;
  }

  const event = req.body;

  console.log("====================================");
  console.log("EVENT:", event.event);

  if (event.event !== "charge.success") return;

  const email = event.data?.customer?.email;
  const reference = event.data?.reference;
  const metadata = event.data?.metadata;

  console.log("Email:", email);
  console.log("Reference:", reference);
  console.log("Metadata:", metadata);

  if (!email || !reference) {
    console.log("❌ Missing email or reference");
    return;
  }

  const courseTag = getCourseTag(event);

  if (!courseTag) {
    console.log("❌ No matching course tag from metadata");
    return;
  }

  console.log("🎯 Assigning Kajabi Tag:", courseTag);

  if (!process.env.KAJABI_API_KEY) {
    console.log("❌ Missing KAJABI_API_KEY");
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
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ KAJABI SUCCESS");
    console.log("Status:", response.status);
    console.log("Response:", response.data);

  } catch (err) {
    console.log("❌ KAJABI FAILED");
    console.log("Status:", err.response?.status);
    console.log("Data:", err.response?.data);
    console.log("Message:", err.message);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});