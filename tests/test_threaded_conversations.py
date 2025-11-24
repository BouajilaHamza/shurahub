import unittest
import asyncio
from app.services.chat.thread_manager import ThreadManager
from app.schemas.chat import ChatMessage, Thread

class TestThreadedConversations(unittest.TestCase):
    """Test cases for threaded conversation functionality"""
    
    def setUp(self):
        """Set up test environment"""
        self.thread_manager = ThreadManager()
        
    async def async_setUp(self):
        """Async setup for tests"""
        # Create a test thread
        self.thread_id = await self.thread_manager.create_thread("Test Threaded Conversation")
        
    def test_thread_creation(self):
        """Test that threads can be created"""
        # Run async setup
        thread_id = asyncio.run(self.thread_manager.create_thread("Test Thread"))
        
        # Verify thread was created
        thread = asyncio.run(self.thread_manager.get_thread(thread_id))
        self.assertEqual(thread.topic, "Test Thread")
        
    def test_message_addition(self):
        """Test that messages can be added to threads"""
        # Run async setup
        asyncio.run(self.async_setUp())
        
        # Create a user message
        user_message = ChatMessage(
            thread_id=self.thread_id,
            sender_type="user",
            sender_id="test_user",
            content="This is a test message"
        )
        
        # Save the message
        saved_message = asyncio.run(self.thread_manager.add_message(user_message))
        
        # Verify message was saved
        messages = asyncio.run(self.thread_manager.get_messages(self.thread_id))
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0].content, "This is a test message")
        
    def test_threaded_replies(self):
        """Test that threaded replies work correctly"""
        # Run async setup
        asyncio.run(self.async_setUp())
        
        # Create a user message
        user_message = ChatMessage(
            thread_id=self.thread_id,
            sender_type="user",
            sender_id="test_user",
            content="Initial message"
        )
        
        # Save the message
        saved_user_message = asyncio.run(self.thread_manager.add_message(user_message))
        
        # Create a reply to the user message
        reply_message = ChatMessage(
            thread_id=self.thread_id,
            sender_type="agent",
            sender_id="agent_1",
            content="Reply to initial message",
            parent_id=saved_user_message.id
        )
        
        # Save the reply
        saved_reply = asyncio.run(self.thread_manager.add_message(reply_message))
        
        # Create a nested reply
        nested_reply = ChatMessage(
            thread_id=self.thread_id,
            sender_type="agent",
            sender_id="agent_2",
            content="Reply to the reply",
            parent_id=saved_reply.id
        )
        
        # Save the nested reply
        saved_nested_reply = asyncio.run(self.thread_manager.add_message(nested_reply))
        
        # Verify all messages were saved
        messages = asyncio.run(self.thread_manager.get_messages(self.thread_id))
        self.assertEqual(len(messages), 3)
        
        # Verify parent-child relationships
        parent_ids = [msg.parent_id for msg in messages]
        self.assertIn(None, parent_ids)  # Initial message has no parent
        self.assertIn(saved_user_message.id, parent_ids)  # First reply's parent is user message
        self.assertIn(saved_reply.id, parent_ids)  # Nested reply's parent is first reply
        
    def test_multiple_threads(self):
        """Test that multiple threads can exist simultaneously"""
        # Create two threads
        thread_id_1 = asyncio.run(self.thread_manager.create_thread("Thread 1"))
        thread_id_2 = asyncio.run(self.thread_manager.create_thread("Thread 2"))
        
        # Add a message to each thread
        message_1 = ChatMessage(
            thread_id=thread_id_1,
            sender_type="user",
            sender_id="test_user",
            content="Message in thread 1"
        )
        
        message_2 = ChatMessage(
            thread_id=thread_id_2,
            sender_type="user",
            sender_id="test_user",
            content="Message in thread 2"
        )
        
        # Save the messages
        asyncio.run(self.thread_manager.add_message(message_1))
        asyncio.run(self.thread_manager.add_message(message_2))
        
        # Verify messages are in correct threads
        messages_1 = asyncio.run(self.thread_manager.get_messages(thread_id_1))
        messages_2 = asyncio.run(self.thread_manager.get_messages(thread_id_2))
        
        self.assertEqual(len(messages_1), 1)
        self.assertEqual(len(messages_2), 1)
        self.assertEqual(messages_1[0].content, "Message in thread 1")
        self.assertEqual(messages_2[0].content, "Message in thread 2")
        
    def test_thread_listing(self):
        """Test that threads can be listed"""
        # Create multiple threads
        asyncio.run(self.thread_manager.create_thread("Thread A"))
        asyncio.run(self.thread_manager.create_thread("Thread B"))
        asyncio.run(self.thread_manager.create_thread("Thread C"))
        
        # List threads
        threads = asyncio.run(self.thread_manager.list_threads())
        
        # Verify threads are listed
        self.assertTrue(len(threads) >= 3)
        thread_topics = [thread.topic for thread in threads]
        self.assertIn("Thread A", thread_topics)
        self.assertIn("Thread B", thread_topics)
        self.assertIn("Thread C", thread_topics)

if __name__ == '__main__':
    unittest.main()
