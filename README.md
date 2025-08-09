# AI Sales Agent

An intelligent AI-powered sales agent that specializes in helping businesses find the right talent and recruitment solutions. Built with Node.js, Express, OpenAI, and SQLite.

## 🚀 Features

- **Intelligent Conversations**: AI-powered chat with context awareness
- **Data Extraction**: Automatically extracts structured data from conversations
- **Session Management**: Persistent chat sessions with SQLite database
- **Memory**: Remembers conversation history for contextual responses
- **RESTful API**: Easy-to-use HTTP endpoints
- **Real-time Processing**: Fast response times with OpenAI integration

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- OpenAI API key

## 🛠️ Installation

1. **Clone or create the project folder**
   ```bash
   mkdir ai-sales-agent
   cd ai-sales-agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Copy the example file
   cp .env.example .env
   
   # Edit .env and add your OpenAI API key
   OPENAI_API_KEY=sk-your-real-openai-api-key
   PORT=3000
   DB_PATH=./data/agent.db
   ```

4. **Start the server**
   ```bash
   # Production mode
   npm start
   
   # Development mode (with auto-reload)
   npm run dev
   ```

## 🎯 Usage

### API Endpoints

#### Chat with the AI Agent
```bash
POST /chat
Content-Type: application/json

{
  "message": "We are a fintech startup in Mumbai hiring 2 backend engineers and a UI/UX designer urgently.",
  "sessionId": "testsession1"
}
```

**Response:**
```json
{
  "success": true,
  "response": "I understand you're a fintech startup in Mumbai looking to hire urgently...",
  "extractedData": {
    "company": {
      "industry": "fintech",
      "location": "Mumbai"
    },
    "hiring": {
      "roles": [
        { "title": "Backend Engineer", "urgency": "urgent" },
        { "title": "UI/UX Designer", "urgency": "urgent" }
      ],
      "totalPositions": 3
    }
  },
  "sessionId": "testsession1"
}
```

#### Get Chat History
```bash
GET /chat/:sessionId
```

#### Health Check
```bash
GET /health
```

### Example Usage with curl

```bash
# Start a conversation
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "We are a fintech startup in Mumbai hiring 2 backend engineers and a UI/UX designer urgently.",
    "sessionId": "testsession1"
  }'

# Get chat history
curl http://localhost:3000/chat/testsession1

# Health check
curl http://localhost:3000/health
```

## 📁 Project Structure

```
ai-sales-agent/
├── src/
│   ├── index.js                 # Main server file
│   ├── constants.js             # System prompts and constants
│   ├── apps/
│   │   └── chatAgent.service.js # AI chat service
│   ├── utils/
│   │   └── db.js               # Database utilities
│   └── dataExtractionSchemas/
│       ├── index.js            # Schema exports
│       └── clientRequirementSchema.js # Data extraction logic
├── data/                       # SQLite database files
├── .env.example               # Environment variables template
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## 🔧 Configuration

### Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `PORT`: Server port (default: 3000)
- `DB_PATH`: SQLite database path (default: ./data/agent.db)
- `LOG_LEVEL`: Logging level (optional)

### Database

The application uses SQLite for data persistence. The database is automatically created at startup with the following tables:

- `sessions`: Chat session information
- `messages`: Individual chat messages with extracted data

## 🧠 AI Capabilities

The AI agent is trained to:

1. **Understand Client Needs**: Extract company information, hiring requirements, and preferences
2. **Provide Solutions**: Offer relevant recruitment and staffing solutions
3. **Ask Clarifying Questions**: When information is missing, ask specific follow-up questions
4. **Maintain Context**: Remember conversation history for contextual responses
5. **Extract Structured Data**: Automatically parse and structure client requirements

## 🔍 Data Extraction

The system automatically extracts structured data from conversations including:

- **Company Information**: Name, industry, size, location
- **Hiring Requirements**: Job titles, skills, experience levels, urgency
- **Additional Context**: Timeline, budget, remote policy, challenges

## 🚀 Development

### Running in Development Mode

```bash
npm run dev
```

This starts the server with nodemon for automatic reloading on file changes.

### Testing the API

You can test the API using tools like:
- [Postman](https://www.postman.com/)
- [Insomnia](https://insomnia.rest/)
- [curl](https://curl.se/)
- [Thunder Client](https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client) (VS Code extension)

## 📊 Database Management

### Viewing the Database

Install a SQLite viewer extension in VS Code and open `data/agent.db` to browse:
- Chat sessions
- Message history
- Extracted data

### Database Schema

```sql
-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  extracted_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions (id)
);
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

If you encounter any issues:

1. Check that your OpenAI API key is valid
2. Ensure all dependencies are installed
3. Verify the database directory exists and is writable
4. Check the console logs for error messages

## 🔮 Future Enhancements

- [ ] Web interface for easier interaction
- [ ] Advanced data extraction with custom models
- [ ] Integration with CRM systems
- [ ] Multi-language support
- [ ] Analytics dashboard
- [ ] Email notifications
- [ ] Advanced conversation analytics
