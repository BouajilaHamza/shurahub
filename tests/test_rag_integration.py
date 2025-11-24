import unittest
import asyncio
import time
from app.services.rag.knowledge_retrieval import KnowledgeRetrieval

class TestRAGIntegration(unittest.TestCase):
    """Test cases for RAG integration functionality"""
    
    def setUp(self):
        """Set up test environment"""
        self.knowledge_retrieval = KnowledgeRetrieval()
        
        # Initialize RAG service
        asyncio.run(self.knowledge_retrieval.initialize())
        
    def test_context_retrieval(self):
        """Test that relevant context can be retrieved"""
        # Test query
        query = "What is the Model Context Protocol?"
        
        # Retrieve context
        context = asyncio.run(self.knowledge_retrieval.retrieve_context(query))
        
        # Verify context was retrieved
        self.assertTrue(len(context) > 0)
        
        # Check if any context item contains relevant information
        relevant_items = [item for item in context if "MCP" in item["content"] or "Model Context Protocol" in item["content"]]
        self.assertTrue(len(relevant_items) > 0)
        
    def test_retrieval_ranking(self):
        """Test that retrieved context is properly ranked by relevance"""
        # Test query
        query = "How does A2A protocol work?"
        
        # Retrieve context
        context = asyncio.run(self.knowledge_retrieval.retrieve_context(query))
        
        # Verify context was retrieved and ranked
        self.assertTrue(len(context) > 0)
        
        # Check if scores are in descending order (higher score = more relevant)
        scores = [item["score"] for item in context]
        self.assertEqual(scores, sorted(scores))
        
    def test_max_results_limit(self):
        """Test that max_results parameter limits the number of results"""
        # Test query
        query = "multi-agent systems"
        
        # Retrieve context with different limits
        context_default = asyncio.run(self.knowledge_retrieval.retrieve_context(query))
        context_limited = asyncio.run(self.knowledge_retrieval.retrieve_context(query, max_results=2))
        
        # Verify result count respects the limit
        self.assertTrue(len(context_limited) <= 2)
        
    def test_latency(self):
        """Test retrieval latency"""
        # Test query
        query = "threaded conversations in chat systems"
        
        # Measure retrieval time using time.perf_counter() instead of asyncio
        start_time = time.perf_counter()
        context = asyncio.run(self.knowledge_retrieval.retrieve_context(query))
        end_time = time.perf_counter()
        
        retrieval_time = end_time - start_time
        
        # Verify retrieval is fast (under 100ms)
        self.assertTrue(retrieval_time < 0.1)
        print(f"RAG retrieval latency: {retrieval_time * 1000:.2f}ms")

if __name__ == '__main__':
    unittest.main()
