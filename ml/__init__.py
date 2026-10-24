import os

# Apple Silicon: let PyTorch run any op the GPU (MPS) doesn't support on the CPU instead of crashing.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
