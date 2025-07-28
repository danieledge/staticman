const express = require('express');
const serverless = require('serverless-http');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware - parse form data properly
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'multipart/form-data', limit: '10mb' }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Helper function to parse multipart form data
function parseMultipartFormData(buffer) {
    const text = buffer.toString('utf-8');
    const boundary = text.split('\r\n')[0];
    const parts = text.split(boundary).filter(part => part && part !== '--\r\n' && part !== '--');

    const formData = {};

    parts.forEach(part => {
        const lines = part.split('\r\n').filter(line => line);
        let fieldName = '';
        let value = '';

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Content-Disposition: form-data;')) {
                const match = lines[i].match(/name="([^"]+)"/);
                if (match) {
                    fieldName = match[1];
                    // The value is typically on the next non-empty line after an empty line
                    if (lines[i + 1] === '' && lines[i + 2]) {
                        value = lines[i + 2];
                    } else if (lines[i + 1]) {
                        value = lines[i + 1];
                    }
                    break;
                }
            }
        }

        if (fieldName && value) {
            // Handle nested field names like fields[title]
            if (fieldName.includes('[') && fieldName.includes(']')) {
                const match = fieldName.match(/([^\[]+)\[([^\]]+)\]/);
                if (match) {
                    const [, parent, child] = match;
                    if (!formData[parent]) formData[parent] = {};
                    formData[parent][child] = value;
                }
            } else {
                formData[fieldName] = value;
            }
        }
    });

    return formData;
}

// Routes
app.get('/v3/version', (req, res) => {
    res.json({ version: '3.0.0' });
});

app.post('/v3/entry/:username/:repository/:branch/:property', async (req, res) => {
    try {
        let formData = {};

        // Parse the form data based on content type
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            formData = parseMultipartFormData(req.body);
        } else {
            formData = req.body;
        }

        // Extract the actual fields from the form data
        const fields = formData.fields || {};
        const options = formData.options || {};

        console.log('Received submission:', {
            params: req.params,
            fields: fields,
            options: options
        });

        // For now, return success with parsed data
        res.json({
            success: true,
            message: 'Staticman endpoint reached - data parsed successfully',
            params: req.params,
            fields: fields,
            options: options,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error processing submission:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/v3/connect/:service/:username/:repository', (req, res) => {
    res.json({
        success: true,
        message: 'Connect endpoint reached',
        params: req.params
    });
});

module.exports.handler = serverless(app);
