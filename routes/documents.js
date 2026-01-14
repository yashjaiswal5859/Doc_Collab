const express = require('express');
const { Document, DocumentVersion } = require('../models/Document');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all documents (public - everyone can see all documents)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const documents = await Document.findAll({
      include: [
        { model: User, as: 'collaborators', attributes: ['id', 'username', 'email'] }
      ],
      order: [['updatedAt', 'DESC']],
      distinct: true
    });

    res.json(documents);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a single document (public - everyone can view)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const document = await Document.findByPk(req.params.id, {
      include: [
        { model: User, as: 'collaborators', attributes: ['id', 'username', 'email'] },
        {
          model: DocumentVersion,
          as: 'versions',
          include: [{ model: User, as: 'updatedBy', attributes: ['id', 'username', 'email'] }],
          order: [['createdAt', 'ASC']]
        }
      ]
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new document
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const document = await Document.create({
      title,
      content: content || '',
      currentVersion: 0
    });

    // Create initial version
    await DocumentVersion.create({
      documentId: document.id,
      content: content || '',
      updatedById: req.userId
    });

    // Fetch document with associations
    const createdDocument = await Document.findByPk(document.id, {
      include: [
        { model: User, as: 'collaborators', attributes: ['id', 'username', 'email'] }
      ]
    });

    res.status(201).json(createdDocument);
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a document (public - everyone can edit)
router.put('/:id', authMiddleware, async (req, res) => {
  const sequelize = require('../config/database');
  const transaction = await sequelize.transaction();
  
  try {
    const { content } = req.body;
    const document = await Document.findByPk(req.params.id, {
      include: [{ model: User, as: 'collaborators' }],
      transaction
    });

    if (!document) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if content actually changed
    if (document.content === content) {
      await transaction.rollback();
      // Fetch and return document without creating new version
      const unchangedDocument = await Document.findByPk(document.id, {
        include: [
          { model: User, as: 'collaborators', attributes: ['id', 'username', 'email'] }
        ]
      });
      return res.json(unchangedDocument);
    }

    // Get last version to avoid duplicates
    const lastVersion = await DocumentVersion.findOne({
      where: { documentId: document.id },
      order: [['createdAt', 'DESC']],
      transaction
    });

    // Only create version if content changed from last version
    // Save the OLD content as a version before updating
    if (!lastVersion || lastVersion.content !== document.content) {
      await DocumentVersion.create({
        documentId: document.id,
        content: document.content, // Save old content as version
        updatedById: req.userId
      }, { transaction });
    }

    // Update document with new content
    document.content = content;
    const versionCount = await DocumentVersion.count({ 
      where: { documentId: document.id },
      transaction 
    });
    document.currentVersion = versionCount;
    await document.save({ transaction });

    await transaction.commit();

    // Fetch updated document with associations
    const updatedDocument = await Document.findByPk(document.id, {
      include: [
        { model: User, as: 'collaborators', attributes: ['id', 'username', 'email'] }
      ]
    });

    console.log(`✅ Document ${req.params.id} updated by user ${req.userId}, version ${versionCount}`);
    res.json(updatedDocument);
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Update document error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete a document (public - everyone can delete)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const document = await Document.findByPk(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    await document.destroy();
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get document versions (public - everyone can view)
router.get('/:id/versions', authMiddleware, async (req, res) => {
  try {
    const document = await Document.findByPk(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const versions = await DocumentVersion.findAll({
      where: { documentId: req.params.id },
      include: [{ model: User, as: 'updatedBy', attributes: ['id', 'username', 'email'] }],
      order: [['createdAt', 'ASC']]
    });

    res.json(versions);
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Revert to a specific version (public - everyone can revert)
router.post('/:id/revert/:versionIndex', authMiddleware, async (req, res) => {
  const sequelize = require('../config/database');
  const transaction = await sequelize.transaction();
  
  try {
    const { id, versionIndex } = req.params;
    const document = await Document.findByPk(id, {
      include: [{ model: User, as: 'collaborators' }],
      transaction
    });

    if (!document) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Document not found' });
    }

    const versions = await DocumentVersion.findAll({
      where: { documentId: id },
      order: [['createdAt', 'ASC']],
      transaction
    });

    const index = parseInt(versionIndex);
    if (index < 0 || index >= versions.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Invalid version index' });
    }

    // Get last version to avoid duplicates
    const lastVersion = await DocumentVersion.findOne({
      where: { documentId: document.id },
      order: [['createdAt', 'DESC']],
      transaction
    });

    // Save current content as new version before reverting (only if different)
    if (!lastVersion || lastVersion.content !== document.content) {
      await DocumentVersion.create({
        documentId: document.id,
        content: document.content,
        updatedById: req.userId
      }, { transaction });
    }

    // Revert to selected version
    document.content = versions[index].content;
    const versionCount = await DocumentVersion.count({ 
      where: { documentId: document.id },
      transaction 
    });
    document.currentVersion = versionCount;
    await document.save({ transaction });

    await transaction.commit();

    // Fetch updated document with associations
    const updatedDocument = await Document.findByPk(document.id, {
      include: [
        { model: User, as: 'collaborators', attributes: ['id', 'username', 'email'] }
      ]
    });

    console.log(`✅ Document ${id} reverted to version ${index} by user ${req.userId}`);
    res.json(updatedDocument);
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Revert version error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
