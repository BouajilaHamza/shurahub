#!/usr/bin/env python3
"""
Open Semantic Protocol (OSP) - Client Search
=============================================

This script simulates a browser/search client that:
1. Uses its own embedding model (Model C: paraphrase-albert-small-v2)
2. Looks up a domain in the Semantic DNS registry
3. Downloads the host's vectors (embedded with a different model!)
4. Applies the projection matrix to align the host's vectors
5. Performs semantic search using cosine similarity

The Magic:
  - Host used: all-MiniLM-L6-v2 (384 dimensions)
  - Client uses: paraphrase-albert-small-v2 (768 dimensions)
  - The projector matrix bridges these incompatible spaces!

This demonstrates the core OSP principle: decentralized semantic search
where every browser is its own search engine.
"""

import json
import os
import sys
import numpy as np
from sentence_transformers import SentenceTransformer

# =============================================================================
# Configuration
# =============================================================================

MODEL_C_NAME = "paraphrase-albert-small-v2"  # Client's model (768 dim)
SHARED_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "shared_data")


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors."""
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def load_dns_registry(domain: str) -> dict:
    """
    Simulate DNS lookup for _semantic.{domain}.
    
    In a real implementation, this would query:
    - TXT record at _semantic.example.com
    - Returns IPFS hash or URL to the vector data
    """
    dns_path = os.path.join(SHARED_DATA_DIR, "dns_registry.json")
    
    if not os.path.exists(dns_path):
        raise FileNotFoundError(
            f"DNS Registry not found at {dns_path}. "
            "Please run host_generator.py first."
        )
    
    with open(dns_path, "r") as f:
        registry = json.load(f)
    
    if domain not in registry["entries"]:
        raise ValueError(f"Domain '{domain}' not found in Semantic DNS registry.")
    
    return registry["entries"][domain]


def load_host_vectors(vectors_filename: str) -> tuple:
    """
    Load the host's pre-computed vectors.
    
    In a real implementation, this would:
    - Fetch from IPFS using the hash from DNS
    - Verify content integrity
    """
    vectors_path = os.path.join(SHARED_DATA_DIR, vectors_filename)
    
    if not os.path.exists(vectors_path):
        raise FileNotFoundError(
            f"Host vectors not found at {vectors_path}. "
            "Please run host_generator.py first."
        )
    
    with open(vectors_path, "r") as f:
        data = json.load(f)
    
    documents = data["documents"]
    texts = [doc["text"] for doc in documents]
    embeddings = np.array([doc["embedding"] for doc in documents])
    
    return texts, embeddings, data["model_name"], data["embedding_dimension"]


def load_projector_matrix(matrix_filename: str) -> np.ndarray:
    """
    Load the projection matrix that aligns Host → Client spaces.
    
    In a real implementation, this tiny matrix (~1MB) would be:
    - Downloaded alongside the vectors
    - Cached locally for repeat visits
    """
    matrix_path = os.path.join(SHARED_DATA_DIR, matrix_filename)
    
    if not os.path.exists(matrix_path):
        raise FileNotFoundError(
            f"Projector matrix not found at {matrix_path}. "
            "Please run train_projector.py first."
        )
    
    return np.load(matrix_path)


def search(query: str, domain: str = "example.com", top_k: int = 3):
    """
    Perform semantic search using the Open Semantic Protocol.
    
    Steps:
    1. DNS lookup for the domain
    2. Load host vectors (different model!)
    3. Load projector matrix
    4. Embed query with client's model
    5. Project host vectors to client space
    6. Calculate similarities and rank results
    """
    
    print("=" * 70)
    print("OPEN SEMANTIC PROTOCOL - CLIENT SEARCH")
    print("=" * 70)
    print(f"\n🔍 Query: \"{query}\"")
    print(f"🌐 Domain: {domain}")
    
    # -------------------------------------------------------------------------
    # Step 1: Semantic DNS Lookup
    # -------------------------------------------------------------------------
    print(f"\n[Step 1] Querying Semantic DNS for _semantic.{domain}...")
    dns_record = load_dns_registry(domain)
    print(f"         ✓ Found! Vector path: {dns_record['vectors_path']}")
    print(f"         → Host model: {dns_record['model_name']}")
    print(f"         → Host dimension: {dns_record['embedding_dimension']}")
    
    # -------------------------------------------------------------------------
    # Step 2: Load Host Vectors
    # -------------------------------------------------------------------------
    print(f"\n[Step 2] Loading host vectors (simulating IPFS fetch)...")
    texts, host_embeddings, host_model, host_dim = load_host_vectors(
        dns_record["vectors_path"]
    )
    print(f"         ✓ Loaded {len(texts)} documents")
    print(f"         → Host embeddings shape: {host_embeddings.shape}")
    print(f"         → Host dimension: {host_dim}D (Model: {host_model})")
    
    # -------------------------------------------------------------------------
    # Step 3: Load Projector Matrix
    # -------------------------------------------------------------------------
    print(f"\n[Step 3] Loading projector matrix (the 'adapter')...")
    projector = load_projector_matrix(dns_record["projector_path"])
    print(f"         ✓ Projector loaded!")
    print(f"         → Matrix shape: {projector.shape}")
    print(f"         → Transforms: {projector.shape[0]}D → {projector.shape[1]}D")
    
    # -------------------------------------------------------------------------
    # Step 4: Load Client Model and Embed Query
    # -------------------------------------------------------------------------
    print(f"\n[Step 4] Embedding query with Client model...")
    print(f"         Loading Model C: {MODEL_C_NAME}")
    model_c = SentenceTransformer(MODEL_C_NAME)
    
    query_embedding = model_c.encode([query], convert_to_numpy=True)[0]
    print(f"         ✓ Query embedded!")
    print(f"         → Query dimension: {query_embedding.shape[0]}D")
    
    # -------------------------------------------------------------------------
    # Step 5: Project Host Vectors to Client Space
    # -------------------------------------------------------------------------
    print(f"\n[Step 5] Projecting host vectors to client space...")
    print(f"         Before projection: {host_embeddings.shape}")
    
    # THE MAGIC: Apply the linear transformation
    projected_embeddings = host_embeddings @ projector
    
    print(f"         After projection:  {projected_embeddings.shape}")
    print(f"         ✓ Successfully transformed {host_dim}D → {query_embedding.shape[0]}D!")
    
    # -------------------------------------------------------------------------
    # Step 6: Calculate Similarities and Rank
    # -------------------------------------------------------------------------
    print(f"\n[Step 6] Calculating cosine similarities...")
    
    similarities = [
        cosine_similarity(query_embedding, proj_emb)
        for proj_emb in projected_embeddings
    ]
    
    # Get top-k results
    ranked_indices = np.argsort(similarities)[::-1][:top_k]
    
    print(f"         ✓ Ranked {len(texts)} documents")
    
    # -------------------------------------------------------------------------
    # Display Results
    # -------------------------------------------------------------------------
    print("\n" + "=" * 70)
    print(f"🏆 TOP {top_k} SEARCH RESULTS")
    print("=" * 70)
    
    for rank, idx in enumerate(ranked_indices, 1):
        score = similarities[idx]
        text = texts[idx]
        
        # Determine relevance indicator
        if score > 0.5:
            relevance = "🟢 High"
        elif score > 0.3:
            relevance = "🟡 Medium"
        else:
            relevance = "🔴 Low"
        
        print(f"\n#{rank} [Score: {score:.4f}] {relevance}")
        print(f"   \"{text}\"")
    
    # -------------------------------------------------------------------------
    # Protocol Summary
    # -------------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("PROTOCOL SUMMARY")
    print("=" * 70)
    print(f"""
What just happened:
  1. Client queried Semantic DNS for "{domain}"
  2. Retrieved vectors embedded with {host_model} ({host_dim}D)
  3. Downloaded tiny projector matrix ({projector.shape[0]}×{projector.shape[1]})
  4. Client embedded query with {MODEL_C_NAME} ({query_embedding.shape[0]}D)
  5. Projected {len(texts)} host vectors: {host_dim}D → {query_embedding.shape[0]}D
  6. Performed cosine similarity search in unified space

Key Insight: 
  The host and client used DIFFERENT AI models, but the projector
  enabled semantic understanding across incompatible embedding spaces!
""")
    
    return [(texts[idx], similarities[idx]) for idx in ranked_indices]


def interactive_mode():
    """Run interactive search loop."""
    print("\n" + "=" * 70)
    print("OPEN SEMANTIC PROTOCOL - INTERACTIVE SEARCH")
    print("=" * 70)
    print("\nEnter search queries to find relevant content.")
    print("Type 'quit' or 'exit' to stop.\n")
    
    while True:
        try:
            query = input("🔍 Search: ").strip()
            
            if not query:
                continue
            
            if query.lower() in ["quit", "exit", "q"]:
                print("\nGoodbye! 👋")
                break
            
            print()
            search(query)
            print()
            
        except KeyboardInterrupt:
            print("\n\nGoodbye! 👋")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}\n")


def main():
    """Main entry point."""
    
    # Check if a query was provided as argument
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        search(query)
    else:
        # Default demo queries
        demo_queries = [
            "financial news and market updates",
            "environmental protection and wildlife",
            "artificial intelligence technology",
        ]
        
        print("\n" + "=" * 70)
        print("RUNNING DEMO SEARCHES")
        print("=" * 70)
        
        for query in demo_queries:
            print("\n" + "-" * 70)
            search(query)
            print()


if __name__ == "__main__":
    main()
