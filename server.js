require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create scores table if not exists
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        pin VARCHAR(4) NOT NULL,
        country VARCHAR(2) NOT NULL,
        score INTEGER NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_scores_date ON scores(date);
      CREATE INDEX IF NOT EXISTS idx_scores_country ON scores(country);
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
}

// API Endpoints
app.post('/api/scores', async (req, res) => {
  const { username, pin, country, score } = req.body;
  
  try {
    const result = await pool.query(
      'INSERT INTO scores (username, pin, country, score) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, pin, country, score]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

app.get('/api/scores/daily', async (req, res) => {
  try {
    // Get the client's local date (from frontend)
    const clientDate = req.query.date; // Expects "YYYY-MM-DD" format
    
    if (!clientDate || !/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
      return res.status(400).json({ error: 'Missing or invalid date (use YYYY-MM-DD)' });
    }

    // Convert client date to Oregon (US West) timezone for DB comparison
    const result = await pool.query(
      `SELECT * FROM scores 
       WHERE date >= $1::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'US/Pacific'
         AND date < ($1::timestamp + INTERVAL '1 day') AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'US/Pacific'
       ORDER BY score DESC 
       LIMIT 10`,
      [clientDate]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error in daily scores:', err);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});
app.get('/api/scores/weekly', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM scores 
       WHERE date >= CURRENT_DATE - INTERVAL '7 days' 
       ORDER BY score DESC 
       LIMIT 10`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

// Initialize and start server
initDB().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
