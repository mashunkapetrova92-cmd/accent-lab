"""Phoneme recognition of model recordings (wav2vec2 espeak CTC, ONNX) for QA."""
import json, subprocess, numpy as np, onnxruntime as ort, os
M = "/home/claude/models/w2v"
vocab = json.load(open(f"{M}/vocab.json")); inv = {v: k for k, v in vocab.items()}
so = ort.SessionOptions(); so.intra_op_num_threads = 2
sess = ort.InferenceSession(f"{M}/onnx/model.onnx", so, providers=["CPUExecutionProvider"])
def load16(path, a=None, b=None):
    cmd = ["ffmpeg", "-v", "error"]
    if a is not None: cmd += ["-ss", str(max(0, a)), "-to", str(b)]
    cmd += ["-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)
def phones(x):
    x = (x - x.mean()) / (x.std() + 1e-7)
    out = sess.run(None, {"input_values": x[None, :].astype(np.float32)})[0][0]
    ids = out.argmax(-1); res = []; prev = -1
    for i in ids:
        if i != prev and i > 3: res.append(inv[int(i)])
        prev = i
    return res
if __name__ == "__main__":
    import sys, time
    t = time.time()
    for p in sys.argv[1:]:
        print(p.split('/')[-1], ' '.join(phones(load16(p))))
    print("%.1fs" % (time.time() - t))
