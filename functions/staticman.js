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

// Import Staticman
const Staticman = require('../lib/Staticman');

// Routes
app.get('/v3/version', (req, res) => {
  res.json({ version: '3.0.0' });
});

app.post('/v3/entry/:username/:repository/:branch/:property', async (req, res) => {
  try {
    const staticman = new Staticman(req.params);
    await staticman.processEntry(req.body, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports.handler = serverless(app);
