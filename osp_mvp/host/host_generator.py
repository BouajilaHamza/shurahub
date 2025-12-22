#!/usr/bin/env python3
"""
Open Semantic Protocol (OSP) - Host Generator
==============================================

This script simulates a website (Host) that:
1. Creates vector embeddings for its content using Model H (all-MiniLM-L6-v2)
2. Publishes these embeddings to a shared location (simulating IPFS)
3. Registers itself in a DNS-like registry

The Host Model: all-MiniLM-L6-v2 (384 dimensions)
"""

import json
import os
import numpy as np
from sentence_transformers import SentenceTransformer

# =============================================================================
# Configuration
# =============================================================================

MODEL_H_NAME = "all-MiniLM-L6-v2"  # Host's embedding model (384 dim)
SHARED_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "shared_data")

# =============================================================================
# Sample Content (20 distinct sentences across Tech, Nature, Finance)
# =============================================================================

SAMPLE_SENTENCES = [
    # Technology (7 sentences)
    "Quantum computing promises to revolutionize cryptography and drug discovery.",
    "Machine learning algorithms are transforming how we analyze big data.",
    "The new smartphone features a neural processing unit for AI tasks.",
    "Cloud computing enables businesses to scale their infrastructure dynamically.",
    "Blockchain technology provides decentralized and tamper-proof record keeping.",
    "Cybersecurity threats are evolving with sophisticated phishing attacks.",
    "Virtual reality headsets are becoming more affordable for consumers.",
    
    # Nature (7 sentences)
    "The Amazon rainforest produces approximately 20% of the world's oxygen.",
    "Climate change is causing glaciers to melt at unprecedented rates.",
    "Coral reefs support 25% of all marine species despite covering less than 1% of the ocean floor.",
    "Migratory birds travel thousands of miles following seasonal patterns.",
    "The deep ocean contains species that have never been seen by humans.",
    "Renewable energy sources like solar and wind are reducing carbon emissions.",
    "Biodiversity loss threatens ecosystem stability and human food security.",
    
    # Finance (6 sentences)
    "Stock market volatility increased due to rising interest rates.",
    "Cryptocurrency adoption is growing among institutional investors.",
    "The central bank announced new monetary policy measures to control inflation.",
    "ESG investing considers environmental, social, and governance factors.",
    "Fintech startups are disrupting traditional banking with mobile-first solutions.",
    "Global supply chain disruptions have impacted quarterly earnings reports.",
]


def main():
    """Main function to generate host embeddings and register in DNS."""
    
    print("=" * 70)
    print("OPEN SEMANTIC PROTOCOL - HOST GENERATOR")
    print("=" * 70)
    
    # Ensure shared_data directory exists
    os.makedirs(SHARED_DATA_DIR, exist_ok=True)
    
    # -------------------------------------------------------------------------
    # Step 1: Load the Host's embedding model
    # -------------------------------------------------------------------------
    print(f"\n[Step 1] Loading Host Model: {MODEL_H_NAME}")
    model_h = SentenceTransformer(MODEL_H_NAME)
    print(f"         Model loaded successfully!")
    
    # -------------------------------------------------------------------------
    # Step 2: Generate embeddings for all sample sentences
    # -------------------------------------------------------------------------
    print(f"\n[Step 2] Generating embeddings for {len(SAMPLE_SENTENCES)} sentences...")
    
    embeddings = model_h.encode(SAMPLE_SENTENCES, convert_to_numpy=True)
    
    print(f"         ✓ Embeddings generated!")
    print(f"         → Shape: {embeddings.shape}")
    print(f"         → Dimension per vector: {embeddings.shape[1]}")
    print(f"         → Data type: {embeddings.dtype}")
    
    # -------------------------------------------------------------------------
    # Step 3: Save embeddings + text to JSON
    # -------------------------------------------------------------------------
    print(f"\n[Step 3] Saving embeddings to shared_data/host_vectors.json...")
    
    # Convert numpy arrays to lists for JSON serialization
    host_data = {
        "model_name": MODEL_H_NAME,
        "embedding_dimension": int(embeddings.shape[1]),
        "num_documents": len(SAMPLE_SENTENCES),
        "documents": [
            {
                "id": i,
                "text": text,
                "embedding": embeddings[i].tolist()
            }
            for i, text in enumerate(SAMPLE_SENTENCES)
        ]
    }
    
    vectors_path = os.path.join(SHARED_DATA_DIR, "host_vectors.json")
    with open(vectors_path, "w") as f:
        json.dump(host_data, f, indent=2)
    
    print(f"         ✓ Saved to: {vectors_path}")
    print(f"         → File size: {os.path.getsize(vectors_path) / 1024:.2f} KB")
    
    # -------------------------------------------------------------------------
    # Step 4: Create DNS Registry (simulating _semantic.example.com TXT record)
    # -------------------------------------------------------------------------
    print(f"\n[Step 4] Creating DNS registry (simulating Semantic DNS)...")
    
    dns_registry = {
        "description": "Semantic DNS Registry - Maps domains to their vector embeddings",
        "protocol_version": "OSP/1.0",
        "entries": {
            "example.com": {
                "vectors_path": "host_vectors.json",
                "model_name": MODEL_H_NAME,
                "embedding_dimension": 384,
                "projector_available": True,
                "projector_path": "projector_matrix.npy",
                "last_updated": "2024-01-15T10:00:00Z"
            }
        }
    }
    
    dns_path = os.path.join(SHARED_DATA_DIR, "dns_registry.json")
    with open(dns_path, "w") as f:
        json.dump(dns_registry, f, indent=2)
    
    print(f"         ✓ DNS Registry created: {dns_path}")
    
    # -------------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("HOST GENERATION COMPLETE")
    print("=" * 70)
    print(f"""
Summary:
  • Model Used: {MODEL_H_NAME}
  • Embedding Dimension: {embeddings.shape[1]}
  • Documents Indexed: {len(SAMPLE_SENTENCES)}
  • Vectors File: shared_data/host_vectors.json
  • DNS Registry: shared_data/dns_registry.json
  
Next Step: Run train_projector.py to create the projection matrix.
""")


if __name__ == "__main__":
    main()
