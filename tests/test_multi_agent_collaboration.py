import unittest
import asyncio
from app.services.agent.agent_manager import AgentManager
from app.services.chat.thread_manager import ThreadManager
from app.services.rag.knowledge_retrieval import KnowledgeRetrieval
from app.schemas.chat import ChatMessage
from app.schemas.agent import AgentRole

class TestMultiAgentCollaboration(unittest.TestCase):
    """Test cases for multi-agent collaboration functionality"""
    
    def setUp(self):
        """Set up test environment"""
        self.agent_manager = AgentManager()
        self.thread_manager = ThreadManager()
        self.knowledge_retrieval = KnowledgeRetrieval()
        
        # Initialize RAG service
        asyncio.run(self.knowledge_retrieval.initialize())
        
    async def async_setUp(self):
        """Async setup for tests"""
        # Create a test thread
        self.thread_id = await self.thread_manager.create_thread("Test Topic")
        
        # Generate prompt templates
        self.prompt_templates = await self.agent_manager.generate_prompt_templates("Test Topic")
        
        # Initialize agents
        await self.agent_manager.initialize_agents(self.thread_id, self.prompt_templates)
        
    def test_agent_initialization(self):
        """Test that agents are properly initialized"""
        # Run async setup
        asyncio.run(self.async_setUp())
        
        # Get agents for thread
        agents = asyncio.run(self.agent_manager.get_thread_agents(self.thread_id))
        
        # Verify agents were created
        self.assertTrue(len(agents) > 0)
        self.assertEqual(len(agents), 3)  # Default agent count from settings
        
        # Verify agent roles
        roles = [agent.role for agent in agents]
        self.assertTrue(AgentRole.RESEARCHER in roles or 
                       AgentRole.CRITIC in roles or
                       AgentRole.CREATIVE in roles or
                       AgentRole.SUMMARIZER in roles or
                       AgentRole.ANALYST in roles or
                       AgentRole.GENERALIST in roles)
        
    def test_agent_response(self):
        """Test that agents can generate responses"""
        # Run async setup
        asyncio.run(self.async_setUp())
        
        # Create a user message
        user_message = ChatMessage(
            thread_id=self.thread_id,
            sender_type="user",
            sender_id="test_user",
            content="What are the key benefits of multi-agent systems?"
        )
        
        # Save the message
        saved_message = asyncio.run(self.thread_manager.add_message(user_message))
        
        # Get agents for thread
        agents = asyncio.run(self.agent_manager.get_thread_agents(self.thread_id))
        
        # Get context from RAG
        context = asyncio.run(self.knowledge_retrieval.retrieve_context(user_message.content))
        
        # Test response from first agent
        agent = agents[0]
        response = asyncio.run(self.agent_manager.get_agent_response(
            agent_id=agent.id,
            thread_id=self.thread_id,
            user_message=user_message,
            context=context
        ))
        
        # Verify response
        self.assertIsNotNone(response)
        self.assertTrue(len(response.content) > 0)
        
    def test_agent_discussion(self):
        """Test that agents can engage in discussions"""
        # Run async setup
        asyncio.run(self.async_setUp())
        
        # Create a user message
        user_message = ChatMessage(
            thread_id=self.thread_id,
            sender_type="user",
            sender_id="test_user",
            content="What are the key benefits of multi-agent systems?"
        )
        
        # Save the message
        saved_message = asyncio.run(self.thread_manager.add_message(user_message))
        
        # Get agents for thread
        agents = asyncio.run(self.agent_manager.get_thread_agents(self.thread_id))
        
        # Get context from RAG
        context = asyncio.run(self.knowledge_retrieval.retrieve_context(user_message.content))
        
        # Generate initial responses
        messages = []
        for agent in agents:
            response = asyncio.run(self.agent_manager.get_agent_response(
                agent_id=agent.id,
                thread_id=self.thread_id,
                user_message=user_message,
                context=context
            ))
            
            agent_message = ChatMessage(
                thread_id=self.thread_id,
                sender_type="agent",
                sender_id=agent.id,
                content=response.content,
                parent_id=user_message.id,
                metadata={"role": agent.role}
            )
            
            saved_message = asyncio.run(self.thread_manager.add_message(agent_message))
            messages.append(saved_message)
        
        # Test discussion response from first agent
        agent = agents[0]
        discussion_response = asyncio.run(self.agent_manager.get_agent_discussion_response(
            agent_id=agent.id,
            thread_id=self.thread_id,
            previous_messages=messages,
            context=context
        ))
        
        # Verify discussion response
        self.assertIsNotNone(discussion_response)
        self.assertTrue(len(discussion_response.content) > 0)
        
    def test_synthesis_generation(self):
        """Test that a synthesis can be generated from agent discussions"""
        # Run async setup
        asyncio.run(self.async_setUp())
        
        # Create a user message and agent responses
        user_message = ChatMessage(
            thread_id=self.thread_id,
            sender_type="user",
            sender_id="test_user",
            content="What are the key benefits of multi-agent systems?"
        )
        
        # Save the message
        saved_user_message = asyncio.run(self.thread_manager.add_message(user_message))
        
        # Get agents for thread
        agents = asyncio.run(self.agent_manager.get_thread_agents(self.thread_id))
        
        # Create some mock discussion messages
        discussion_messages = [saved_user_message]
        
        for i, agent in enumerate(agents):
            agent_message = ChatMessage(
                thread_id=self.thread_id,
                sender_type="agent",
                sender_id=agent.id,
                content=f"Agent {i} response about multi-agent systems.",
                parent_id=user_message.id,
                metadata={"role": agent.role}
            )
            
            saved_message = asyncio.run(self.thread_manager.add_message(agent_message))
            discussion_messages.append(saved_message)
        
        # Generate synthesis
        synthesis = asyncio.run(self.agent_manager.generate_synthesis(
            thread_id=self.thread_id,
            discussion_messages=discussion_messages
        ))
        
        # Verify synthesis
        self.assertIsNotNone(synthesis)
        self.assertTrue(len(synthesis) > 0)
        self.assertTrue("Summary" in synthesis or "Consensus" in synthesis)

if __name__ == '__main__':
    unittest.main()
