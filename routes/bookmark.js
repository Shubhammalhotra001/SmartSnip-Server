const express = require('express');
const { check, validationResult } = require('express-validator');
const axios = require('axios');
const cheerio = require('cheerio');
const Bookmark = require('../models/bookmark');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Helper to extract metadata
const getMetadata = async (url) => {
  try {
    const response = await axios.get(url, { timeout: 5000 });
    const html = response.data;
    const $ = cheerio.load(html);

    const title = $('title').text().trim() || url;
    let favicon =
      $('link[rel="icon"]').attr('href') ||
      $('link[rel="shortcut icon"]').attr('href') ||
      $('meta[property="og:image"]').attr('content');

    if (favicon && !favicon.startsWith('http')) {
      const { origin } = new URL(url);
      favicon = favicon.startsWith('/') ? `${origin}${favicon}` : `${origin}/${favicon}`;
    }

    if (!favicon) {
      const { origin } = new URL(url);
      favicon = `${origin}/favicon.ico`;
    }

    return { title, favicon };
  } catch (error) {
    console.warn('Metadata fetch failed:', error.message);
    return { title: url, favicon: '' };
  }
};

// Helper to fetch and clean summary from Jina AI
const getSummary = async (url) => {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const response = await axios.get(jinaUrl, { timeout: 5000 });
    const rawSummary = response.data.slice(0, 10000); // Increased character limit

    // Extract content after "Markdown Content"
    const markdownIndex = rawSummary.indexOf('Markdown Content:');
    const summaryText = markdownIndex !== -1 ? rawSummary.slice(markdownIndex + 17).trim() : rawSummary;

    const cleaned = summaryText
      .split('\n')
      .filter(
        (line) =>
          line.trim() &&
          !line.startsWith('[') &&
          !line.startsWith('![') &&
          !line.toLowerCase().includes('sign in') &&
          !line.toLowerCase().includes('sign up') &&
          !line.toLowerCase().includes('open in app') &&
          !line.toLowerCase().includes('sitemap') &&
          !line.toLowerCase().includes('redirect=') &&
          !line.toLowerCase().includes('favicon')
      )
      .join(' ');

    const sentences = cleaned.match(/[^.!?]+[.!?]/g) || [];
    return sentences.slice(0, 6).join(' ').trim() || 'No summary available.'; // Increased to 6 sentences
  } catch (error) {
    console.warn('Summary fetch failed:', error.message);
    return 'Summary could not be generated.';
  }
};

// POST /api/bookmarks
router.post(
  '/',
  authMiddleware,
  [check('url', 'Valid URL is required').isURL()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { url, tags = [] } = req.body;

    try {
      const { title, favicon } = await getMetadata(url);
      const summary = await getSummary(url);

      const count = await Bookmark.countDocuments({ userId: req.userId });
      const bookmark = new Bookmark({
        userId: req.userId,
        url,
        title,
        favicon,
        summary,
        tags: Array.isArray(tags) ? tags.map((tag) => tag.toLowerCase()) : [],
        position: count,
      });

      await bookmark.save();
      res.status(201).json({ message: 'Bookmark saved', bookmark });
    } catch (error) {
      console.error('Bookmark save error:', error.message);
      res.status(500).json({ message: 'Server error while saving bookmark' });
    }
  }
);

// GET /api/bookmarks
router.get('/', authMiddleware, async (req, res) => {
  const { tag } = req.query;

  try {
    const query = { userId: req.userId };
    if (tag) query.tags = tag.toLowerCase();

    const bookmarks = await Bookmark.find(query).sort({ position: 1 });
    res.json({ bookmarks });
  } catch (error) {
    console.error('Bookmark fetch error:', error.message);
    res.status(500).json({ message: 'Failed to fetch bookmarks' });
  }
});

// DELETE /api/bookmarks/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Bookmark.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Bookmark not found or unauthorized' });
    }

    await Bookmark.updateMany(
      { userId: req.userId, position: { $gt: deleted.position } },
      { $inc: { position: -1 } }
    );

    res.json({ message: 'Bookmark deleted successfully' });
  } catch (error) {
    console.error('Bookmark delete error:', error.message);
    res.status(500).json({ message: 'Server error while deleting bookmark' });
  }
});

// PATCH /api/bookmarks/reorder
router.patch('/reorder', authMiddleware, async (req, res) => {
  const { bookmarkId, newPosition } = req.body;

  try {
    const bookmark = await Bookmark.findOne({ _id: bookmarkId, userId: req.userId });
    if (!bookmark) {
      return res.status(404).json({ message: 'Bookmark not found or unauthorized' });
    }

    const oldPosition = bookmark.position;
    if (oldPosition === newPosition) {
      return res.json({ message: 'No position change needed' });
    }

    if (newPosition < oldPosition) {
      await Bookmark.updateMany(
        { userId: req.userId, position: { $gte: newPosition, $lt: oldPosition } },
        { $inc: { position: 1 } }
      );
    } else {
      await Bookmark.updateMany(
        { userId: req.userId, position: { $gt: oldPosition, $lte: newPosition } },
        { $inc: { position: -1 } }
      );
    }

    bookmark.position = newPosition;
    await bookmark.save();

    res.json({ message: 'Bookmark reordered successfully' });
  } catch (error) {
    console.error('Bookmark reorder error:', error.message);
    res.status(500).json({ message: 'Server error while reordering bookmarks' });
  }
});

module.exports = router;