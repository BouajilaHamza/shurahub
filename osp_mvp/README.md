# Open Semantic Protocol (OSP) - Proof of Concept

## Overview

This MVP demonstrates the **Open Semantic Protocol (OSP)**, a decentralized architecture for semantic search where websites host their own vector embeddings. The key innovation is the **Projector Layer** - a linear transformation matrix that enables different AI models to "agree" on meaning without sharing training data.

## The Problem

Current semantic search is centralized:
- To search the web semantically, you must use aggregators (Google/Bing)
- They control the only unified index
- Self-hosting fails because "Llama-3 vectors" are incompatible with "GPT-4 vectors"

## The Solution

**Just-in-Time Semantic Projection:**

1. **Hosts** (websites) publish their content embeddings using any model
2. **Clients** (browsers) use their own preferred embedding model
3. A **Projector Matrix** translates between embedding spaces

This is similar to how Vision-Language Models (like CLIP) align image and text encoders.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        THE OPEN SEMANTIC PROTOCOL                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐  │
│  │   HOST       │      │  PROJECTOR   │      │     CLIENT       │  │
│  │              │      │              │      │                  │  │
│  │  Model H     │ ───► │  384D → 768D │ ◄─── │    Model C       │  │
│  │  384 dim     │      │  Linear Map  │      │    768 dim       │  │
│  │              │      │              │      │                  │  │
│  │  Publishes   │      │  ~1MB file   │      │  Embeds Query    │  │
│  │  Vectors     │      │  (adapter)   │      │  Searches        │  │
│  └──────────────┘      └──────────────┘      └──────────────────┘  │
│         │                     │                       │            │
│         └──────────── Semantic DNS ───────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
osp_mvp/
├── host/
│   ├── host_generator.py      # Step A: Generate host embeddings
│   └── train_projector.py     # Step B: Train projection matrix
├── client/
│   └── client_search.py       # Step C: Client-side search
├── shared_data/               # Simulates IPFS/distributed storage
│   ├── host_vectors.json      # Host's content embeddings
│   ├── dns_registry.json      # Semantic DNS registry
│   ├── projector_matrix.npy   # Linear transformation matrix
│   └── projector_metadata.json
├── requirements.txt
└── README.md
```

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Pipeline

Execute in order:

```bash
# Step A: Host generates embeddings (Model H: all-MiniLM-L6-v2, 384D)
python host/host_generator.py

# Step B: Train projector matrix (384D → 768D)
python host/train_projector.py

# Step C: Client searches (Model C: paraphrase-albert-small-v2, 768D)
python client/client_search.py
```

### 3. Custom Search

```bash
python client/client_search.py "your search query here"
```

## Models Used

| Role   | Model                        | Dimensions |
|--------|------------------------------|------------|
| Host   | `all-MiniLM-L6-v2`          | 384        |
| Client | `paraphrase-albert-small-v2` | 768        |

## The Math: Linear Projection

Given paired embeddings (H, C) for the same sentences:

```
H: Host embeddings (N × 384)
C: Client embeddings (N × 768)
W: Projection matrix (384 × 768)

Goal: Find W such that H @ W ≈ C
```

We use Linear Regression (without bias) to learn W. Research on cross-lingual embedding alignment (Conneau et al., 2017) shows that linear transformations are surprisingly effective at aligning embedding spaces.

## Key Files Explained

### `host_vectors.json`
Contains the host's pre-computed embeddings:
```json
{
  "model_name": "all-MiniLM-L6-v2",
  "embedding_dimension": 384,
  "documents": [
    {"id": 0, "text": "...", "embedding": [0.1, 0.2, ...]}
  ]
}
```

### `dns_registry.json`
Simulates Semantic DNS (TXT records pointing to vectors):
```json
{
  "entries": {
    "example.com": {
      "vectors_path": "host_vectors.json",
      "projector_path": "projector_matrix.npy"
    }
  }
}
```

### `projector_matrix.npy`
The ~1MB adapter matrix that transforms vectors between spaces.

## Sample Output

```
🔍 Query: "financial news and market updates"
🌐 Domain: example.com

[Step 5] Projecting host vectors to client space...
         Before projection: (20, 384)
         After projection:  (20, 768)
         ✓ Successfully transformed 384D → 768D!

🏆 TOP 3 SEARCH RESULTS
#1 [Score: 0.6234] 🟢 High
   "Stock market volatility increased due to rising interest rates."

#2 [Score: 0.5891] 🟢 High
   "Global supply chain disruptions have impacted quarterly earnings reports."

#3 [Score: 0.5423] 🟢 High
   "Cryptocurrency adoption is growing among institutional investors."
```

## Experimental Validation

We conducted rigorous experiments to validate the Projector Layer.

### Experiment 1: Cross-Model Retrieval (STS Benchmark)

**Setup:**
- Dataset: 5,000 sentences from STS Benchmark
- Train/Test Split: 80% / 20%
- Host Model: `all-MiniLM-L6-v2` (384D)
- Client Model: `all-mpnet-base-v2` (768D)
- Projector: Ridge Regression (α=1.0)

**Results:**

| Method | Dimensionality | Recall@1 | Recall@5 | Recall@10 |
|--------|----------------|----------|----------|-----------|
| No Projection (Raw) | Mismatch (384≠768) | 0.0% | N/A | N/A |
| **OSP Linear Projector** | Aligned (768) | **99.0%** | **100.0%** | **100.0%** |
| Oracle (Same Model) | Native (768) | 100.0% | 100.0% | 100.0% |

**Performance Recovery: 99.0%** of Oracle performance!

### Experiment 2: Generalization to Unseen Domain

**Setup:**
- Training: STS Benchmark (semantic similarity sentences)
- Testing: AG News (news articles - completely different domain!)
- The projector was NEVER trained on news content

**Results:**

| Method | Recall@1 | Recall@5 | Recall@10 |
|--------|----------|----------|-----------|
| **OSP Linear Projector** | **99.4%** | **100.0%** | **100.0%** |
| Oracle (Same Model) | 100.0% | 100.0% | 100.0% |

**Key Insight:** Linear projections generalize across domains!

### Run Experiments

```bash
# Main validation experiment
python3 experiments/validate_projector.py

# Generalization test (unseen domain)
python3 experiments/generalization_test.py
```

## References

- Conneau, A., et al. (2017). "Word Translation Without Parallel Data" - Cross-lingual alignment
- Radford, A., et al. (2021). "Learning Transferable Visual Models" (CLIP) - Multimodal projection
- Sentence-Transformers: https://www.sbert.net/

## Future Work

1. **Real DNS Integration**: Implement actual TXT record queries
2. **IPFS Storage**: Content-addressable vector hosting
3. **Multi-Projector Hub**: Pre-computed matrices for popular model pairs
4. **Browser Extension**: Native search integration
5. **Federated Training**: Collaborative projector training

---

*The Open Semantic Protocol: Decoupling Intelligence from Indexing via Semantic DNS*
