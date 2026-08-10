const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({status: 'ok', timestamp: new Date().toISOString() });
});

const axios = require('axios');

app.post('/api/request', async (req, res) => {
    const { method = 'GET', url, headers = {}, body } = req.body;

    if(!url){
        return res.status(400).json({ success: false, error: 'url is required' });
    }

    const start = performance.now();

    try{
        const response = await axios({
            method, 
            url, 
            headers, 
            data: body,
            timeout: 10000,
            validateStatus: () => true,
        });

        const durationMs = performance.now() - start;

        res.json({
            success: true,
            status: response.status,
            statusText: response.statusText,
            durationMs: Math.round(durationMs),
            headers: response.headers,
            body: response.data,
        });
    }catch (err) {
        const durationMs = performance.now() - start;

        res.json({
            success: false,
            error: err.message,
            code: err.code,
            durationMs: Math.round(durationMs),
        });
    }
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`API tester backend running on http://localhost:${PORT}`);
});