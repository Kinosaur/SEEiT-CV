import os, time, itertools, json
import numpy as np, pandas as pd
from PIL import Image
from pathlib import Path
from sklearn.metrics import confusion_matrix, classification_report, accuracy_score, precision_recall_fscore_support
import matplotlib.pyplot as plt
import tensorflow as tf

BASE = r"D:\SeeIt\Combined_Dataset_V9"
MODEL_TFLITE = os.path.join(BASE, "effb0_meta.tflite")
IMG_SIZE = 224

LABELS = [
    "car",
    "crosswalk",
    "cycle",
    "emergency_exit",
    "stop",
    "traffic_green",
    "traffic_red",
    "traffic_yellow",
    "truck",
    "van",
]
NUM_CLASSES = len(LABELS)

FOLDER_MAP = {
    "traffic green": "traffic_green",
    "traffic red": "traffic_red",
    "traffic yellow": "traffic_yellow",
}


if not os.path.exists(MODEL_TFLITE):
    raise FileNotFoundError(f"Model not found: {MODEL_TFLITE}")

interpreter = tf.lite.Interpreter(model_path=MODEL_TFLITE)
interpreter.allocate_tensors()
in_det = interpreter.get_input_details()[0]
out_det = interpreter.get_output_details()[0]
print(f"[OK] Loaded INT8 model: {MODEL_TFLITE}")

def preprocess(path):
    im = Image.open(path).convert("RGB").resize((IMG_SIZE, IMG_SIZE))
    x = np.expand_dims(np.array(im, dtype=np.uint8), 0)  
    return x


def predict(path):
    x = preprocess(path)
    interpreter.set_tensor(in_det["index"], x)
    interpreter.invoke()
    return interpreter.get_tensor(out_det["index"])[0]

def evaluate(split_dir):
    rows = []
    for cls in LABELS:
        folder_name = cls.replace("_", " ") if cls in FOLDER_MAP.values() else cls
        folder = os.path.join(split_dir, folder_name)
        if not os.path.isdir(folder):
            continue
        for f in os.listdir(folder):
            if f.lower().endswith((".jpg", ".jpeg", ".png")):
                rows.append((os.path.join(folder, f), cls))
    df = pd.DataFrame(rows, columns=["filepath", "label"])

    y_true = [LABELS.index(lbl) for lbl in df["label"]]
    y_pred = []
    for p in df["filepath"]:
        y = predict(p)
        y_pred.append(int(np.argmax(y)))

    acc = accuracy_score(y_true, y_pred)
    p, r, f1, _ = precision_recall_fscore_support(y_true, y_pred, average="macro", zero_division=0)
    rep = classification_report(y_true, y_pred, target_names=LABELS, digits=2)
    cm = confusion_matrix(y_true, y_pred)

    out_dir = Path(BASE) / "evidence"
    out_dir.mkdir(exist_ok=True)

    with open(out_dir / "classification_report.txt", "w", encoding="utf-8") as f:
        f.write(rep)

    rep_dict = classification_report(
        y_true, y_pred, target_names=LABELS, output_dict=True, zero_division=0
    )

    rows = []
    for name in LABELS:
        if name in rep_dict:
            d = rep_dict[name]
            rows.append({
                "class": name.replace("_", " "),
                "precision": d.get("precision", 0.0),
                "recall": d.get("recall", 0.0),
                "f1": d.get("f1-score", 0.0),
                "support": d.get("support", 0)
            })
        else:
            rows.append({
                "class": name.replace("_", " "),
                "precision": 0.0, "recall": 0.0, "f1": 0.0, "support": 0
            })

    per_df = pd.DataFrame(rows)
    per_df.to_csv(out_dir / "per_class.csv", index=False)

    plt.figure(figsize=(8, 6))
    plt.imshow(cm, cmap="Blues")
    plt.title("Confusion Matrix (Test)")
    plt.colorbar()
    plt.xticks(range(NUM_CLASSES), [c.replace("_", " ") for c in LABELS], rotation=45, ha="right")
    plt.yticks(range(NUM_CLASSES), [c.replace("_", " ") for c in LABELS])
    for i, j in itertools.product(range(cm.shape[0]), range(cm.shape[1])):
        plt.text(j, i, cm[i, j],
                 ha="center",
                 color="white" if cm[i, j] > cm.max() / 2 else "black",
                 fontsize=8)
    plt.xlabel("Predicted"); plt.ylabel("True")
    plt.tight_layout()
    plt.savefig(out_dir / "confusion_matrix.png", dpi=250)
    plt.close()

    top = []
    for i in range(NUM_CLASSES):
        for j in range(NUM_CLASSES):
            if i != j and cm[i, j] > 0:
                top.append((LABELS[i].replace("_", " "), LABELS[j].replace("_", " "), int(cm[i, j])))
    pd.DataFrame(sorted(top, key=lambda x: x[2], reverse=True),
                 columns=["true", "predicted", "count"]).to_csv(out_dir / "top_confusions.csv", index=False)

    result = {
        "accuracy": round(acc * 100, 2),
        "precision": round(p * 100, 2),
        "recall": round(r * 100, 2),
        "f1": round(f1 * 100, 2)
    }
    with open(out_dir / "summary.json", "w") as f:
        json.dump(result, f, indent=2)
    print("[DONE] Evidence saved to:", out_dir)
    print("Accuracy:", result)
    return result


if __name__ == "__main__":
    TEST_DIR = os.path.join(BASE, "test")
    evaluate(TEST_DIR)
