import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.rag.workflow import ask

GOLDEN_PATH = Path(__file__).resolve().parents[1] / "data" / "golden_dataset.json"


def retrieval_metrics(retrieved_sources, relevant_sources, k=4):
    if not relevant_sources:
        return {"hit_rate": 1.0, "precision": 1.0, "recall": 1.0, "mrr": 1.0}
    hits = [s for s in retrieved_sources[:k] if s in relevant_sources]
    hit_rate = 1.0 if any(s in relevant_sources for s in retrieved_sources[:k]) else 0.0
    precision = len(hits) / max(len(retrieved_sources[:k]), 1)
    recall = len(set(hits)) / len(set(relevant_sources))
    mrr = 0.0
    for i, s in enumerate(retrieved_sources[:k], 1):
        if s in relevant_sources:
            mrr = 1.0 / i
            break
    return {"hit_rate": hit_rate, "precision": precision, "recall": recall, "mrr": mrr}


def run_evaluation():
    with open(GOLDEN_PATH) as f:
        dataset = json.load(f)

    results = []
    for item in dataset:
        result = ask(item["question"])
        retrieved = [c.get("title", "") for c in result.get("citations", [])]
        rm = retrieval_metrics(retrieved, item["relevant_sources"])
        results.append({
            "id": item["id"],
            "question": item["question"],
            "source_used": result["source_used"],
            "expected_source": item["source_type"],
            "retrieval": rm,
            "answer": result["answer"][:200],
            "trace": result.get("trace", []),
        })

    n = len(results)
    avg = lambda key: sum(r["retrieval"][key] for r in results) / n
    print("=== Retrieval Metrics ===")
    print(f"Hit Rate@K: {avg('hit_rate'):.3f}")
    print(f"Precision@K: {avg('precision'):.3f}")
    print(f"Recall@K:    {avg('recall'):.3f}")
    print(f"MRR:         {avg('mrr'):.3f}")
    print()
    print("=== Source Routing Accuracy ===")
    correct = sum(1 for r in results if r["source_used"] == r["expected_source"])
    print(f"{correct}/{n} = {correct/n:.3f}")
    print()
    for r in results:
        print(f"[{r['id']}] {r['question'][:50]} -> {r['source_used']} (expected {r['expected_source']}) HR={r['retrieval']['hit_rate']}")


if __name__ == "__main__":
    run_evaluation()
