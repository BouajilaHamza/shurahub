# Multi-Agent Collaborative AI Chat Platform
## Deployment and Usage Guide

This document provides instructions for deploying and using the Multi-Agent Collaborative AI Chat Platform with MCP & A2A integration.

## Project Overview

The Multi-Agent Collaborative AI Chat Platform enables multiple AI agents to collaboratively reason and refine responses to user queries through threaded conversations. The platform integrates Model Context Protocol (MCP) and Agent-to-Agent (A2A) communication, along with Retrieval-Augmented Generation (RAG) for enhanced context and depth.

## System Architecture

The platform follows a modular architecture with the following components:

1. **FastAPI Backend**: Handles API requests, WebSocket connections, and coordinates agent interactions
2. **React Frontend**: Provides a responsive user interface for threaded conversations
3. **Agent Service**: Manages AI agents and their collaborative reasoning
4. **RAG Service**: Provides knowledge retrieval using FAISS vector database
5. **Docker Containers**: Enables easy deployment and scaling

## Deployment Instructions

### Prerequisites

- Docker and Docker Compose
- Git
- 4GB+ RAM for running the application

### Option 1: Local Deployment with Docker Compose

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd multi_agent_chat_platform
   ```

2. Build and start the containers:
   ```bash
   docker-compose up --build
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### Option 2: AWS Deployment

1. Set up an AWS account if you don't have one

2. Install the AWS CLI and configure it with your credentials:
   ```bash
   aws configure
   ```

3. Deploy using the provided script:
   ```bash
   ./deploy_aws.sh
   ```

4. The script will output the URLs for accessing your deployed application

## Usage Guide

### Starting a New Discussion

1. Navigate to the application in your browser
2. Enter a discussion topic in the "Start a New Discussion" form
3. Click "Start Discussion" to create a new thread

### Interacting with Agents

1. Type your message in the input field at the bottom of the chat
2. Press Enter or click Send
3. The agents will collaboratively reason about your query
4. You can interject at any point with follow-up questions

### Navigating Threaded Conversations

1. Messages are organized in threads based on their relationships
2. Click on any message to view its thread
3. Use the sidebar to switch between different discussion topics

## Configuration Options

The platform can be configured through environment variables:

### Backend Configuration

Create a `.env` file in the backend directory with the following options:

```
# API settings
API_V1_STR=/api
PROJECT_NAME=Multi-Agent Collaborative AI Chat Platform

# CORS settings (restrict in production)
BACKEND_CORS_ORIGINS=["http://localhost:3000","https://yourdomain.com"]

# Agent settings
DEFAULT_AGENT_COUNT=3
A2A_DISCUSSION_ROUNDS=2

# RAG settings
MAX_CONTEXT_DOCUMENTS=5

# Authentication (when implemented)
AUTH_ENABLED=false
SECRET_KEY=your_secret_key_here
ACCESS_TOKEN_EXPIRE_MINUTES=11520
```

### Frontend Configuration

Create a `.env` file in the frontend directory:

```
REACT_APP_API_URL=http://localhost:8000
```

## Vector Database

The platform uses FAISS as the vector database for RAG functionality, selected for its superior latency performance. See `vector_db_selection.md` for detailed benchmarking results and alternative options.

## Future Enhancements

1. **Authentication**: Enable the authentication placeholders for user management
2. **Custom Agent Roles**: Allow users to define custom agent roles and expertise areas
3. **External Knowledge Sources**: Connect to additional knowledge bases beyond the built-in RAG
4. **Mobile App**: Develop native mobile applications for iOS and Android

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failures**
   - Check that your firewall allows WebSocket connections
   - Verify the backend service is running

2. **High Latency**
   - Ensure the FAISS vector database is properly initialized
   - Check system resources, especially RAM availability

3. **Agent Responses Not Appearing**
   - Check browser console for errors
   - Verify WebSocket connection status

### Getting Help

For additional assistance, please contact support or open an issue in the project repository.
