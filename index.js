require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const bookmarkRoutes = require('./routes/bookmark');

// Connect to MongoDB
connectDB();

const app = express();

// Security middleware
app.use(helmet()); // Set security headers
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000', // Restrict to frontend origin
    credentials: true,
  })
);

// Rate limiting to prevent brute force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: '✅ Link Saver API Running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/bookmarks', bookmarkRoutes);

// Centralized error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));