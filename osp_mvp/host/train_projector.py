#!/usr/bin/env python3
"""
Open Semantic Protocol (OSP) - Projector Trainer
=================================================

This script creates the "Universal Translator" between embedding spaces.

The Problem:
  - Host uses Model H: all-MiniLM-L6-v2 (384 dimensions)
  - Client uses Model C: paraphrase-albert-small-v2 (768 dimensions)
  - These vectors are incompatible (different dimensions, different spaces)

The Solution:
  Train a linear projection matrix that transforms:
    Model H vectors (384 dim) → Model C vectors (768 dim)

This is similar to how Vision-Language Models (like CLIP) align different 
encoder spaces using learned linear projections.

Mathematical Basis:
  Given paired embeddings (H, C) for the same sentences:
  We find matrix W such that: H @ W ≈ C
  Where W is a (384 x 768) matrix

Cross-lingual alignment research (Conneau et al., 2017) shows that 
linear transformations are surprisingly effective at aligning embedding spaces.
"""

import json
import os
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LinearRegression

# =============================================================================
# Configuration
# =============================================================================

MODEL_H_NAME = "all-MiniLM-L6-v2"       # Host model (384 dim)
MODEL_C_NAME = "paraphrase-albert-small-v2"  # Client model (768 dim)
SHARED_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "shared_data")

# Same sentences used by the host (for training the projection)
TRAINING_SENTENCES = [
    # Technology
    "Quantum computing promises to revolutionize cryptography and drug discovery.",
    "Machine learning algorithms are transforming how we analyze big data.",
    "The new smartphone features a neural processing unit for AI tasks.",
    "Cloud computing enables businesses to scale their infrastructure dynamically.",
    "Blockchain technology provides decentralized and tamper-proof record keeping.",
    "Cybersecurity threats are evolving with sophisticated phishing attacks.",
    "Virtual reality headsets are becoming more affordable for consumers.",
    
    # Nature
    "The Amazon rainforest produces approximately 20% of the world's oxygen.",
    "Climate change is causing glaciers to melt at unprecedented rates.",
    "Coral reefs support 25% of all marine species despite covering less than 1% of the ocean floor.",
    "Migratory birds travel thousands of miles following seasonal patterns.",
    "The deep ocean contains species that have never been seen by humans.",
    "Renewable energy sources like solar and wind are reducing carbon emissions.",
    "Biodiversity loss threatens ecosystem stability and human food security.",
    
    # Finance
    "Stock market volatility increased due to rising interest rates.",
    "Cryptocurrency adoption is growing among institutional investors.",
    "The central bank announced new monetary policy measures to control inflation.",
    "ESG investing considers environmental, social, and governance factors.",
    "Fintech startups are disrupting traditional banking with mobile-first solutions.",
    "Global supply chain disruptions have impacted quarterly earnings reports.",
]


def main():
    """Train the projector matrix to align Model H → Model C."""
    
    print("=" * 70)
    print("OPEN SEMANTIC PROTOCOL - PROJECTOR TRAINER")
    print("=" * 70)
    
    # -------------------------------------------------------------------------
    # Step 1: Load both models
    # -------------------------------------------------------------------------
    print(f"\n[Step 1] Loading embedding models...")
    print(f"         Loading Model H (Host): {MODEL_H_NAME}")
    model_h = SentenceTransformer(MODEL_H_NAME)
    
    print(f"         Loading Model C (Client): {MODEL_C_NAME}")
    model_c = SentenceTransformer(MODEL_C_NAME)
    
    print(f"         ✓ Both models loaded!")
    
    # -------------------------------------------------------------------------
    # Step 2: Generate paired embeddings
    # -------------------------------------------------------------------------
    print(f"\n[Step 2] Generating paired embeddings for {len(TRAINING_SENTENCES)} sentences...")
    
    # Generate embeddings with both models for the same sentences
    embeddings_h = model_h.encode(TRAINING_SENTENCES, convert_to_numpy=True)
    embeddings_c = model_c.encode(TRAINING_SENTENCES, convert_to_numpy=True)
    
    print(f"\n         Model H embeddings:")
    print(f"         → Shape: {embeddings_h.shape}")
    print(f"         → Dimension: {embeddings_h.shape[1]}")
    
    print(f"\n         Model C embeddings:")
    print(f"         → Shape: {embeddings_c.shape}")
    print(f"         → Dimension: {embeddings_c.shape[1]}")
    
    # -------------------------------------------------------------------------
    # Step 3: Train the Linear Projection
    # -------------------------------------------------------------------------
    print(f"\n[Step 3] Training Linear Projection (Model H → Model C)...")
    print(f"         Learning transformation: {embeddings_h.shape[1]}D → {embeddings_c.shape[1]}D")
    
    # Use LinearRegression without intercept (pure linear transformation)
    # This learns W such that: H @ W ≈ C
    projector = LinearRegression(fit_intercept=False)
    projector.fit(embeddings_h, embeddings_c)
    
    # The projection matrix
    projection_matrix = projector.coef_.T  # Shape: (384, 768)
    
    print(f"\n         ✓ Projection matrix trained!")
    print(f"         → Matrix shape: {projection_matrix.shape}")
    print(f"         → Input dimension: {projection_matrix.shape[0]}")
    print(f"         → Output dimension: {projection_matrix.shape[1]}")
    
    # -------------------------------------------------------------------------
    # Step 4: Validate the projection quality
    # -------------------------------------------------------------------------
    print(f"\n[Step 4] Validating projection quality...")
    
    # Project Model H embeddings to Model C space
    projected_embeddings = embeddings_h @ projection_matrix
    
    print(f"         → Projected shape: {projected_embeddings.shape}")
    
    # Calculate cosine similarity between projected and actual Model C embeddings
    def cosine_similarity(a, b):
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
    
    similarities = [
        cosine_similarity(projected_embeddings[i], embeddings_c[i])
        for i in range(len(TRAINING_SENTENCES))
    ]
    
    avg_similarity = np.mean(similarities)
    min_similarity = np.min(similarities)
    max_similarity = np.max(similarities)
    
    print(f"\n         Projection Quality Metrics:")
    print(f"         → Average cosine similarity: {avg_similarity:.4f}")
    print(f"         → Min similarity: {min_similarity:.4f}")
    print(f"         → Max similarity: {max_similarity:.4f}")
    
    if avg_similarity > 0.8:
        print(f"         ✓ Excellent alignment! Projection is highly effective.")
    elif avg_similarity > 0.6:
        print(f"         ✓ Good alignment. Projection is working well.")
    else:
        print(f"         ⚠ Moderate alignment. Results may vary.")
    
    # -------------------------------------------------------------------------
    # Step 5: Save the projection matrix
    # -------------------------------------------------------------------------
    print(f"\n[Step 5] Saving projection matrix...")
    
    os.makedirs(SHARED_DATA_DIR, exist_ok=True)
    matrix_path = os.path.join(SHARED_DATA_DIR, "projector_matrix.npy")
    np.save(matrix_path, projection_matrix)
    
    # Also save metadata
    metadata = {
        "source_model": MODEL_H_NAME,
        "target_model": MODEL_C_NAME,
        "source_dimension": int(projection_matrix.shape[0]),
        "target_dimension": int(projection_matrix.shape[1]),
        "training_samples": len(TRAINING_SENTENCES),
        "average_alignment_score": float(avg_similarity),
        "matrix_file": "projector_matrix.npy"
    }
    
    metadata_path = os.path.join(SHARED_DATA_DIR, "projector_metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"         ✓ Matrix saved to: {matrix_path}")
    print(f"         ✓ Metadata saved to: {metadata_path}")
    print(f"         → Matrix file size: {os.path.getsize(matrix_path) / 1024:.2f} KB")
    
    # -------------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("PROJECTOR TRAINING COMPLETE")
    print("=" * 70)
    print(f"""
Summary:
  • Source Model (Host): {MODEL_H_NAME} ({projection_matrix.shape[0]}D)
  • Target Model (Client): {MODEL_C_NAME} ({projection_matrix.shape[1]}D)
  • Projection Matrix: {projection_matrix.shape[0]} × {projection_matrix.shape[1]}
  • Alignment Quality: {avg_similarity:.4f} average cosine similarity
  • Matrix File: shared_data/projector_matrix.npy ({os.path.getsize(matrix_path) / 1024:.2f} KB)

The projector enables a client using {MODEL_C_NAME} to search content 
indexed with {MODEL_H_NAME}, bridging the dimensional gap.

Next Step: Run client_search.py to test semantic search!
""")


if __name__ == "__main__":
    main()
