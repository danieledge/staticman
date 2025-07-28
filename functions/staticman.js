const express = require('express');
const serverless = require('serverless-http');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Routes
app.get('/v3/version', (req, res) => {
  res.json({ version: '3.0.0' });
});

app.post('/v3/entry/:username/:repository/:branch/:property', async (req, res) => {
  try {
    // For now, just return success to test the deployment
    res.json({
 success: true,
 message: 'Staticman endpoint reached',
 params: req.params,
 body: req.body,
 timestamp: new Date().toISOString()
    });
  } catch (error) {
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

● Read(file_path: "/root/www/fogh/functions-staticman-complete.js")
  ⎿  const express = require('express');   
const serverless = require('serverless-http');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Routes
app.get('/v3/version', (req, res) => {
  res.json({ version: '3.0.0' });
});

app.post('/v3/entry/:username/:repository/:branch/:property', async (req, res) => {
  try {
    // For now, just return success to test the deployment
    res.json({
 success: true,
 message: 'Staticman endpoint reached',
 params: req.params,
 body: req.body,
 timestamp: new Date().toISOString()
    });
  } catch (error) {
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
