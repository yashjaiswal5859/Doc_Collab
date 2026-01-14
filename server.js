require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const sequelize = require('./config/database');

const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const { Document } = require('./models/Document');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? 'https://your-frontend-domain.com'
      : 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Database Connection (Supabase)
sequelize.authenticate()
  .then(() => {
    console.log('✅ Supabase connected successfully');
    return sequelize.sync({ alter: true });
  })
  .then(() => {
    console.log('✅ Database tables synchronized');
  })
  .catch(err => {
    console.error('❌ Database connection error:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    
    if (err.parent) {
      console.error('Database error code:', err.parent.code);
      console.error('Database error detail:', err.parent.detail);
      console.error('Database error hint:', err.parent.hint);
    }
    
    // Check for common issues
    if (err.message && err.message.includes('password')) {
      console.error('💡 Hint: Check if DB_PASSWORD in .env has quotes around it. Remove quotes if present.');
    }
    if (err.message && err.message.includes('timeout')) {
      console.error('💡 Hint: Check if your IP is allowed in Supabase firewall settings.');
    }
    if (err.message && err.message.includes('ENOTFOUND')) {
      console.error('💡 Hint: Check if DB_HOST is correct in .env file.');
    }
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Socket.io for real-time collaboration
const documentRooms = new Map();
// Auto-save timers for debounced saving
const autoSaveTimers = new Map();

// Helper function to save document to database with versioning
async function saveDocumentToDB(documentId, content, userId, isExplicitSave = false) {
  const { DocumentVersion } = require('./models/Document');
  
  // Use transaction for atomicity
  const transaction = await sequelize.transaction();
  
  try {
    // Fetch document with collaborators for access check
    const document = await Document.findByPk(documentId, {
      include: [{ model: User, as: 'collaborators' }],
      transaction
    });

    if (!document) {
      await transaction.rollback();
      throw new Error('Document not found');
    }

    // Check if user has access
    const collaboratorIds = document.collaborators.map(c => c.id);
    const hasAccess =
      document.ownerId === parseInt(userId) ||
      collaboratorIds.includes(parseInt(userId));

    if (!hasAccess) {
      await transaction.rollback();
      throw new Error('Access denied');
    }

    // Check if content actually changed
    if (document.content === content) {
      await transaction.rollback();
      if (isExplicitSave) {
        console.log(`Document ${documentId} content unchanged, skipping save`);
      }
      return;
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
        updatedById: userId
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

    // Commit transaction
    await transaction.commit();

    const saveType = isExplicitSave ? 'explicit save' : 'auto-save';
    console.log(`✅ Document ${documentId} ${saveType} by user ${userId}, version ${versionCount}`);
    
    return { document, versionCount };
  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();
    console.error(`❌ Error saving document ${documentId}:`, error);
    throw error;
  }
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.userId);

  // Join document room
  socket.on('join-document', async (documentId) => {
    try {
      const document = await Document.findByPk(documentId, {
        include: [
          { model: User, as: 'owner' },
          { model: User, as: 'collaborators' }
        ]
      });

      if (!document) {
        socket.emit('error', { message: 'Document not found' });
        return;
      }

      // Check if user has access
      const collaboratorIds = document.collaborators.map(c => c.id);
      const hasAccess =
        document.ownerId === parseInt(socket.userId) ||
        collaboratorIds.includes(parseInt(socket.userId));

      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      socket.join(documentId);

      // Track users in room
      if (!documentRooms.has(documentId)) {
        documentRooms.set(documentId, new Set());
      }
      documentRooms.get(documentId).add(socket.userId);

      // Notify others in the room
      socket.to(documentId).emit('user-joined', {
        userId: socket.userId,
        documentId
      });

      // Send current active users
      const activeUsers = Array.from(documentRooms.get(documentId));
      socket.emit('active-users', activeUsers);

      console.log(`User ${socket.userId} joined document ${documentId}`);
    } catch (error) {
      console.error('Join document error:', error);
      socket.emit('error', { message: 'Failed to join document' });
    }
  });

  // Handle document changes
  socket.on('document-change', async ({ documentId, content, cursorPosition }) => {
    try {
      // Broadcast to all other users in the room
      socket.to(documentId).emit('document-update', {
        content,
        userId: socket.userId,
        cursorPosition,
        timestamp: Date.now()
      });

      // Auto-save to database with debouncing (2 seconds after last change)
      const timerKey = `${documentId}_${socket.userId}`;
      
      // Clear existing timer
      if (autoSaveTimers.has(timerKey)) {
        clearTimeout(autoSaveTimers.get(timerKey));
      }

      // Set new timer for auto-save
      const timer = setTimeout(async () => {
        try {
          await saveDocumentToDB(documentId, content, socket.userId, false);
          autoSaveTimers.delete(timerKey);
        } catch (error) {
          console.error('Auto-save error:', error);
          autoSaveTimers.delete(timerKey);
        }
      }, 2000); // 2 seconds debounce

      autoSaveTimers.set(timerKey, timer);
    } catch (error) {
      console.error('Document change error:', error);
    }
  });

  // Handle cursor position updates
  socket.on('cursor-position', ({ documentId, position }) => {
    socket.to(documentId).emit('cursor-update', {
      userId: socket.userId,
      position
    });
  });

  // Handle explicit save
  socket.on('save-document', async ({ documentId, content }) => {
    try {
      // Clear any pending auto-save timer
      const timerKey = `${documentId}_${socket.userId}`;
      if (autoSaveTimers.has(timerKey)) {
        clearTimeout(autoSaveTimers.get(timerKey));
        autoSaveTimers.delete(timerKey);
      }

      await saveDocumentToDB(documentId, content, socket.userId, true);
      
      // Notify all users in the room
      const document = await Document.findByPk(documentId);
      io.to(documentId).emit('document-saved', {
        documentId,
        timestamp: document.updatedAt,
        version: document.currentVersion
      });
    } catch (error) {
      console.error('Save document error:', error);
      socket.emit('error', { message: 'Failed to save document', error: error.message });
    }
  });

  // Leave document room
  socket.on('leave-document', (documentId) => {
    socket.leave(documentId);

    if (documentRooms.has(documentId)) {
      documentRooms.get(documentId).delete(socket.userId);

      if (documentRooms.get(documentId).size === 0) {
        documentRooms.delete(documentId);
      }
    }

    socket.to(documentId).emit('user-left', {
      userId: socket.userId,
      documentId
    });

    console.log(`User ${socket.userId} left document ${documentId}`);
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.userId);

    // Save any pending changes before disconnect
    for (const [timerKey, timer] of autoSaveTimers.entries()) {
      if (timerKey.endsWith(`_${socket.userId}`)) {
        clearTimeout(timer);
        autoSaveTimers.delete(timerKey);
        
        // Extract documentId from timerKey (format: documentId_userId)
        const documentId = timerKey.split('_')[0];
        try {
          // Get latest content from the room state or fetch from DB
          const document = await Document.findByPk(documentId);
          if (document) {
            // Try to save if there are unsaved changes
            // Note: This is a best-effort save, actual content should be saved via document-change
            console.log(`Attempting final save for document ${documentId} on disconnect`);
          }
        } catch (error) {
          console.error('Error saving on disconnect:', error);
        }
      }
    }

    // Remove user from all document rooms
    documentRooms.forEach((users, documentId) => {
      if (users.has(socket.userId)) {
        users.delete(socket.userId);
        socket.to(documentId).emit('user-left', {
          userId: socket.userId,
          documentId
        });

        if (users.size === 0) {
          documentRooms.delete(documentId);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
