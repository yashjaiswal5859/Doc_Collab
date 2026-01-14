const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  currentVersion: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'documents',
  timestamps: true
});

const DocumentVersion = sequelize.define('DocumentVersion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  documentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'documents',
      key: 'id'
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  updatedById: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'document_versions',
  timestamps: true,
  updatedAt: false
});

const DocumentCollaborator = sequelize.define('DocumentCollaborator', {
  documentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'documents',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'document_collaborators',
  timestamps: false
});

// Define associations
Document.hasMany(DocumentVersion, { as: 'versions', foreignKey: 'documentId', onDelete: 'CASCADE' });
Document.belongsToMany(User, { as: 'collaborators', through: DocumentCollaborator, foreignKey: 'documentId', otherKey: 'userId' });

DocumentVersion.belongsTo(User, { as: 'updatedBy', foreignKey: 'updatedById' });
DocumentVersion.belongsTo(Document, { foreignKey: 'documentId' });

module.exports = { Document, DocumentVersion, DocumentCollaborator };
