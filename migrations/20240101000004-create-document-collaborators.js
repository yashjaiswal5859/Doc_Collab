'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('document_collaborators', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      documentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'documents',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      }
    });

    // Add indexes
    await queryInterface.addIndex('document_collaborators', ['documentId']);
    await queryInterface.addIndex('document_collaborators', ['userId']);

    // Add unique constraint to prevent duplicate collaborator entries
    await queryInterface.addConstraint('document_collaborators', {
      fields: ['documentId', 'userId'],
      type: 'unique',
      name: 'unique_document_collaborator'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('document_collaborators');
  }
};
