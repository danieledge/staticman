const express = require('express');
const serverless = require('serverless-http');
const { createAppAuth } = require('@octokit/auth-app');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Middleware
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
                    if (i + 1 < lines.length && lines[i + 1] === '') {
                        value = lines[i + 2] || '';
                    } else if (i + 1 < lines.length) {
                        value = lines[i + 1];
                    }
                    break;
                }
            }
        }

        if (fieldName) {
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

// Initialize GitHub client with App authentication
async function getOctokit() {
    const appId = process.env.GITHUB_APP_ID;
    let privateKey = process.env.GITHUB_PRIVATE_KEY_DECODED;
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

    if (!appId || !privateKey || !installationId) {
        throw new Error('Missing GitHub App credentials');
    }

    // Ensure private key has proper line endings
    privateKey = privateKey.replace(/\\n/g, '\n');

    // If the key doesn't start with the proper header, try to fix it
    if (!privateKey.includes('-----BEGIN')) {
        throw new Error('Invalid private key format - missing BEGIN header');
    }

    try {
        const octokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
                appId: parseInt(appId),
                privateKey: privateKey,
                installationId: parseInt(installationId),
            },
        });

        return octokit;
    } catch (error) {
        console.error('Error creating Octokit instance:', error);
        throw new Error(`GitHub authentication failed: ${error.message}`);
    }
}

// Generate filename for submission
function generateFilename(type) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = uuidv4().substring(0, 8);
    return `${type}-${timestamp}-${id}.json`;
}

// Hash email for privacy
function hashEmail(email) {
    return crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
}

// Routes
app.get('/v3/version', (req, res) => {
    res.json({ version: '3.0.0' });
});

// Debug endpoint to check configuration
app.get('/v3/debug/config', (req, res) => {
    const hasAppId = !!process.env.GITHUB_APP_ID;
    const hasPrivateKey = !!process.env.GITHUB_PRIVATE_KEY_DECODED;
    const hasInstallationId = !!process.env.GITHUB_APP_INSTALLATION_ID;

    let privateKeyInfo = 'Not set';
    if (hasPrivateKey) {
        const key = process.env.GITHUB_PRIVATE_KEY_DECODED;
        privateKeyInfo = {
            length: key.length,
            hasBeginHeader: key.includes('-----BEGIN'),
            hasEndFooter: key.includes('-----END'),
            firstChars: key.substring(0, 30) + '...',
            lastChars: '...' + key.substring(key.length - 30)
        };
    }

    res.json({
        config: {
            GITHUB_APP_ID: hasAppId ? 'Set' : 'Missing',
            GITHUB_PRIVATE_KEY_DECODED: hasPrivateKey ? privateKeyInfo : 'Missing',
            GITHUB_APP_INSTALLATION_ID: hasInstallationId ? 'Set' : 'Missing',
        }
    });
});

app.post('/v3/entry/:username/:repository/:branch/:property', async (req, res) => {
    try {
        let formData = {};

        // Parse the form data
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            formData = parseMultipartFormData(req.body);
        } else {
            formData = req.body;
        }

        const fields = formData.fields || {};
        const options = formData.options || {};
        const { username, repository, branch, property } = req.params;

        // Validate required fields based on property type
        const requiredFields = property === 'timelineAmendments'
            ? ['name', 'email', 'originalEntryDate', 'amendments']
            : ['name', 'email', 'date', 'title', 'description'];

        const missingFields = requiredFields.filter(field => !fields[field]);
        if (missingFields.length > 0) {
            return res.status(400).json({
                error: 'MISSING_REQUIRED_FIELDS',
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        // Prepare submission data
        const submissionData = {
            _id: hashEmail(fields.email),
            ...fields,
            email: hashEmail(fields.email), // Hash email for privacy
            date: new Date().toISOString()
        };

        // Initialize GitHub client
        const octokit = await getOctokit();

        // Determine file path
        const filePath = property === 'timelineAmendments'
            ? `_data/timeline/amendments/${generateFilename('amendment')}`
            : `_data/timeline/entries/${generateFilename('entry')}`;

        // Create file content
        const fileContent = JSON.stringify(submissionData, null, 2);
        const contentBase64 = Buffer.from(fileContent).toString('base64');

        // Create branch name for PR
        const prBranch = `staticman_${property}_${Date.now()}`;

        // Get the base branch reference
        const { data: ref } = await octokit.rest.git.getRef({
            owner: username,
            repo: repository,
            ref: `heads/${branch}`
        });

        // Create new branch
        await octokit.rest.git.createRef({
            owner: username,
            repo: repository,
            ref: `refs/heads/${prBranch}`,
            sha: ref.object.sha
        });

        // Create file in new branch
        await octokit.rest.repos.createOrUpdateFileContents({
            owner: username,
            repo: repository,
            path: filePath,
            message: `Add Staticman entry`,
            content: contentBase64,
            branch: prBranch
        });

        // Create pull request
        const prTitle = property === 'timelineAmendments'
            ? `Amendment for entry: ${fields.originalEntryDate}`
            : `New timeline entry: ${fields.title}`;

        const prBody = `### Staticman Submission
        
**Type**: ${property === 'timelineAmendments' ? 'Amendment' : 'New Entry'}
**Submitted by**: ${fields.name}
**Date**: ${new Date().toISOString()}

#### Content
${property === 'timelineAmendments' 
    ? `**Original Entry Date**: ${fields.originalEntryDate}\n**Amendments**: ${fields.amendments}`
    : `**Date**: ${fields.date}\n**Title**: ${fields.title}\n**Description**: ${fields.description}`}

${fields.citations ? `**Citations**: ${fields.citations}` : ''}
${fields.imageSuggestions ? `**Image Suggestions**: ${fields.imageSuggestions}` : ''}

---
*This pull request was automatically generated by Staticman.*`;

        const { data: pr } = await octokit.rest.pulls.create({
            owner: username,
            repo: repository,
            title: prTitle,
            body: prBody,
            head: prBranch,
            base: branch
        });

        // Return success with redirect if specified
        if (options.redirect) {
            res.redirect(options.redirect);
        } else {
            res.json({
                success: true,
                message: 'Submission created successfully',
                pull_request: {
                    url: pr.html_url,
                    number: pr.number
                }
            });
        }

    } catch (error) {
        console.error('Error processing submission:', error);
        res.status(500).json({
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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
