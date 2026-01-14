# Backend - Real-time Collaboration Platform

Node.js backend server with Express, Socket.io, and MongoDB for the real-time collaboration platform.

## Features

- RESTful API with Express
- JWT-based authentication
- WebSocket real-time communication
- MongoDB database with Mongoose
- Document version control
- User access control

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/collab-platform
JWT_SECRET=your_jwt_secret_key_change_this_in_production
NODE_ENV=development
```

## Running the Server

```bash
# Start server
npm start

# Development mode (with nodemon)
npm run dev
```

Server will run on http://localhost:5000

## API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer {token}
```

### Document Endpoints

All document endpoints require authentication via JWT token in Authorization header.

#### Get All Documents
```http
GET /api/documents
Authorization: Bearer {token}
```

Returns all documents where user is owner or collaborator.

#### Get Single Document
```http
GET /api/documents/:id
Authorization: Bearer {token}
```

#### Create Document
```http
POST /api/documents
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "My Document",
  "content": "Document content here"
}
```

#### Update Document
```http
PUT /api/documents/:id
Authorization: Bearer {token}
Content-Type: application/json

{
  "content": "Updated content"
}
```

Creates a new version automatically.

#### Delete Document
```http
DELETE /api/documents/:id
Authorization: Bearer {token}
```

Only document owner can delete.

#### Get Document Versions
```http
GET /api/documents/:id/versions
Authorization: Bearer {token}
```

#### Revert to Version
```http
POST /api/documents/:id/revert/:versionIndex
Authorization: Bearer {token}
```

## WebSocket Events

Connect to WebSocket server with JWT token:

```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your_jwt_token'
  }
});
```

### Client → Server Events

- **join-document**: `socket.emit('join-document', documentId)`
- **leave-document**: `socket.emit('leave-document', documentId)`
- **document-change**: `socket.emit('document-change', { documentId, content, cursorPosition })`
- **save-document**: `socket.emit('save-document', { documentId, content })`
- **cursor-position**: `socket.emit('cursor-position', { documentId, position })`

### Server → Client Events

- **document-update**: Receive content updates from other users
- **active-users**: List of users currently editing
- **user-joined**: Notification when user joins
- **user-left**: Notification when user leaves
- **document-saved**: Confirmation of successful save
- **cursor-update**: Other users' cursor positions
- **error**: Error messages

## Database Models

### User Model
```javascript
{
  username: String (unique, required),
  email: String (unique, required),
  password: String (hashed, required),
  createdAt: Date
}
```

### Document Model
```javascript
{
  title: String (required),
  content: String,
  owner: ObjectId (User ref),
  collaborators: [ObjectId] (User refs),
  versions: [{
    content: String,
    timestamp: Date,
    updatedBy: ObjectId (User ref)
  }],
  currentVersion: Number,
  createdAt: Date,
  updatedAt: Date
}
```

## Project Structure

```
backend/
├── models/
│   ├── User.js          # User model with password hashing
│   └── Document.js      # Document model with versions
├── routes/
│   ├── auth.js          # Authentication routes
│   └── documents.js     # Document CRUD routes
├── middleware/
│   └── auth.js          # JWT verification middleware
├── server.js            # Main server file
├── .env                 # Environment variables
├── .gitignore
└── package.json
```

## Security

- Passwords are hashed using bcryptjs with salt
- JWT tokens expire after 7 days
- Protected routes verify JWT token
- Document access is validated before operations
- CORS configured for frontend origin

## Error Handling

All endpoints return appropriate HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

## Testing with cURL

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"test123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Get documents (replace TOKEN)
curl http://localhost:5000/api/documents \
  -H "Authorization: Bearer TOKEN"
```

## Dependencies

- express: Web framework
- socket.io: WebSocket library
- mongoose: MongoDB ODM
- jsonwebtoken: JWT implementation
- bcryptjs: Password hashing
- cors: Cross-origin resource sharing
- dotenv: Environment variables

## Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `brew services start mongodb-community`
- Check MONGODB_URI in .env

### Port Already in Use
- Change PORT in .env to a different port

### JWT Token Invalid
- Token expires after 7 days, login again
- Check JWT_SECRET is set in .env

## License

Educational project for SDE-1 assignment.
