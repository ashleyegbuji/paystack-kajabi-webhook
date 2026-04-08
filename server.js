const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Verify Paystack webhook signature
function verifyPaystackSignature(req) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto.createHmac('sha512', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');
    return hash === req.headers['x-paystack-signature'];
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    if (!verifyPaystackSignature(req)) return res.status(400).send('Invalid signature');

    const event = req.body;

    // Only process successful charges
    if (event.event !== 'charge.success') {
        return res.sendStatus(200);
    }

    const email = event.data.customer.email;
    const course = event.data.metadata.course; // Ensure this metadata is set on the payment page
    let courseTag;

    if(course === "THE MASTERCLASS") courseTag = "THE MASTERCLASS Access";
    else if(course === "VIBE CODER") courseTag = "VIBE CODER Access";
    else return res.sendStatus(200); // ignore unknown courses

    try {
        await axios.post('https://app.kajabi.com/api/v1/people', {
            person: { email, tags: [courseTag] }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.KAJABI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`Access granted to ${email} for ${courseTag}`);
    } catch (err) {
        console.error('Kajabi API error:', err.response?.data || err.message);
    }

    res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
