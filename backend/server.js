const express = require('express');
const cors = require('cors');
const runLoadTest = require('./loadTestRunner');
const calculateMetrics = require('./metrics');


const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({status: 'ok', timestamp: new Date().toISOString() });
});

const axios = require('axios');

app.post('/api/load-test', async (req, res) => {
    const {url, method = 'GET', concurrency, totalRequests } = req.body;

    if(!url){
        return res.status(400).json({ success: false, error: 'url is required' });
    }

    if(!concurrency || concurrency < 1){
        return res.status(400).json({ success: false, error: 'concurrency must be at least 1' });
    }

    if(!totalRequests || totalRequests < 1){
        return res.status(400).json({ success: false, error: 'totalRequests must be at least 1' });
    }

    try{
        const start = performance.now();
        const results = await runLoadTest({url, method, concurrency, totalRequests });
        const totalDurationMs = performance.now() - start;
        const metrics = calculateMetrics(results, totalDurationMs);

        res.json({
            success: true,
            totalDurationMs: Math.round(totalDurationMs),
            metrics,
            results,
        });
    }catch (err){
        res.status(500).json({success: false, error: err.message});
    }
});

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