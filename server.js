require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create table if not exists
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        pin VARCHAR(4) NOT NULL,
        country VARCHAR(2) NOT NULL,
        score INTEGER NOT NULL,
        date TIMESTAMP NOT NULL,
        UNIQUE(username, country)
      );
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
}

initializeDatabase();

// Save score endpoint
app.post('/api/scores', async (req, res) => {
  const { username, pin, country, score, date } = req.body;
  
  // Basic validation
  if (!username || !pin || pin.length !== 4 || isNaN(pin) || !country || !score) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  try {
    // Check if username exists for this country
    const existing = await pool.query(
      'SELECT * FROM scores WHERE username = $1 AND country = $2',
      [username, country]
    );
    
    if (existing.rows.length) {
      // Verify PIN
      if (existing.rows[0].pin !== pin) {
        return res.status(400).json({ error: 'Username already exists with different PIN' });
      }
      // Update existing score if higher
      if (score > existing.rows[0].score) {
        await pool.query(
          'UPDATE scores SET score = $1, date = $2 WHERE username = $3 AND country = $4',
          [score, date, username, country]
        );
        return res.json({ success: true, message: 'Score updated' });
      }
      return res.json({ success: true, message: 'Existing score is higher' });
    } else {
      // Insert new score
      await pool.query(
        'INSERT INTO scores (username, pin, country, score, date) VALUES ($1, $2, $3, $4, $5)',
        [username, pin, country, score, date]
      );
      return res.json({ success: true, message: 'Score saved' });
    }
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get daily leaderboard
app.get('/api/scores/daily', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT username, country, score, date 
      FROM scores 
      WHERE date::date = $1
      ORDER BY score DESC
      LIMIT 10
    `, [today]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting daily scores:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get weekly leaderboard
app.get('/api/scores/weekly', async (req, res) => {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const result = await pool.query(`
      SELECT username, country, score, date 
      FROM scores 
      WHERE date >= $1
      ORDER BY score DESC
      LIMIT 10
    `, [weekAgo.toISOString()]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting weekly scores:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database URL: ${process.env.DATABASE_URL}`);
});