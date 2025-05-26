const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: { type: String, required: true },
  title: { type: String, required: true },
  favicon: { type: String, default: '' },
  summary: { type: String, default: '' },
  tags: [{ type: String, lowercase: true, trim: true }],
  position: { type: Number, default: 0 }, // For drag-drop reordering
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Bookmark', bookmarkSchema);