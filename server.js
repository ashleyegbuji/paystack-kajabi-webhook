require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

function verifyPaystackSignature(req) {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    const hash = crypto.createHmac('sha512', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    return hash === req.headers['x-paystack-signature'];
}

app.post('/webhook', async (req, res) => {

    if (!verifyPaystackSignature(req)) {
        console.log("Invalid Paystack signature");
        return res.status(400).send('Invalid signature');
    }

    const event = req.body;

    console.log("Incoming Paystack Event:");
    console.log(JSON.stringify(event, null, 2));

    if (event.event !== 'charge.success') {
        console.log("Ignored event:", event.event);
        return res.sendStatus(200);
    }

    const email = event.data.customer.email;

    const referrer = event.data.metadata?.referrer || "";
    const domain = event.data.domain || "";

    let courseTag = null;

    // THE MASTERCLASS (first two links)
    if (
        referrer.includes("vv9va-2vit") ||
        referrer.includes("simvoafrica") ||
        domain.includes("vv9va-2vit") ||
        domain.includes("simvoafrica")
    ) {
        courseTag = "THE MASTERCLASS Access";
    }

    // VIBE CODER (last link)
    else if (
        referrer.includes("u49leptunf") ||
        domain.includes("u49leptunf")
    ) {
        courseTag = "VIBE CODER Access";
    }

    else {
        console.log("Unknown payment source");
        return res.sendStatus(200);
    }

    try {
        await axios.post(
            'https://app.kajabi.com/api/v1/people',
            {
                person: {
                    email: email,
                    tags: [courseTag]
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.KAJABI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`Access granted to ${email} for ${courseTag}`);

    } catch (err) {
        console.error("Kajabi API error:", err.response?.data || err.message);
    }

    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});