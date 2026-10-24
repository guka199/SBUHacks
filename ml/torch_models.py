"""Deep learning models (PyTorch) for tabular data, behind the same fit/predict interface as ml/models.py.

    mlp             deep multilayer perceptron (BatchNorm, GELU, dropout)
    resnet          tabular ResNet: residual MLP blocks (Gorishniy et al., 2021)
    ft_transformer  Feature Tokenizer + Transformer: each feature becomes a token, attention mixes them
                    (Gorishniy et al., 2021)

Inputs go through make_preprocessor (median fill + quantile normalization); the target is scaled to 0-1.
Training: AdamW, MSE loss, learning-rate decay on plateau, early stopping on the validation set and a
wall-clock time budget so a run can never hang. Trains on the Apple GPU (MPS) when available, CPU otherwise;
the trained network is moved to CPU so it can be saved and served anywhere.
"""

import copy
import sys
import time

import numpy as np
import torch
from torch import nn

from ml.models import make_preprocessor

# On macOS, PyTorch's OpenMP thread pool deadlocks if XGBoost/LightGBM (another OpenMP runtime) are
# loaded. One CPU thread avoids it; GPU (MPS) training is unaffected.
if sys.platform == "darwin" and ({"xgboost", "lightgbm"} & set(sys.modules)):
    torch.set_num_threads(1)


def get_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class MLPNet(nn.Module):
    def __init__(self, n_in: int, hidden=(512, 256, 128), dropout: float = 0.15):
        super().__init__()
        layers, d = [], n_in
        for h in hidden:
            layers += [nn.Linear(d, h), nn.BatchNorm1d(h), nn.GELU(), nn.Dropout(dropout)]
            d = h
        self.net = nn.Sequential(*layers, nn.Linear(d, 1))

    def forward(self, x):
        return self.net(x).squeeze(-1)


class ResNetNet(nn.Module):
    def __init__(self, n_in: int, d: int = 256, n_blocks: int = 3, expand: int = 2, dropout: float = 0.15):
        super().__init__()
        self.first = nn.Linear(n_in, d)
        self.blocks = nn.ModuleList(
            nn.Sequential(
                nn.BatchNorm1d(d), nn.Linear(d, d * expand), nn.ReLU(), nn.Dropout(dropout),
                nn.Linear(d * expand, d), nn.Dropout(dropout),
            )
            for _ in range(n_blocks)
        )
        self.head = nn.Sequential(nn.BatchNorm1d(d), nn.ReLU(), nn.Linear(d, 1))

    def forward(self, x):
        x = self.first(x)
        for block in self.blocks:
            x = x + block(x)
        return self.head(x).squeeze(-1)


class FTTransformerNet(nn.Module):
    def __init__(self, n_in: int, d: int = 32, n_layers: int = 2, n_heads: int = 4, dropout: float = 0.1):
        super().__init__()
        # Feature tokenizer: token_i = x_i * W_i + b_i  (one learned d-dim embedding per feature)
        self.weight = nn.Parameter(torch.randn(n_in, d) * d**-0.5)
        self.bias = nn.Parameter(torch.randn(n_in, d) * d**-0.5)
        self.cls = nn.Parameter(torch.randn(1, 1, d) * d**-0.5)
        layer = nn.TransformerEncoderLayer(
            d_model=d, nhead=n_heads, dim_feedforward=d * 2, dropout=dropout,
            activation="gelu", batch_first=True, norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=n_layers, enable_nested_tensor=False)
        self.head = nn.Sequential(nn.LayerNorm(d), nn.ReLU(), nn.Linear(d, 1))

    def forward(self, x):
        tokens = x.unsqueeze(-1) * self.weight + self.bias  # (batch, features, d)
        tokens = torch.cat([self.cls.expand(x.shape[0], -1, -1), tokens], dim=1)
        return self.head(self.encoder(tokens)[:, 0]).squeeze(-1)


NETS = {"mlp": MLPNet, "resnet": ResNetNet, "ft_transformer": FTTransformerNet}


class TorchRegressor:
    def __init__(
        self, arch: str, epochs: int = 100, batch_size: int = 512, lr: float = 1e-3,
        weight_decay: float = 1e-5, patience: int = 8, time_budget_s: float = 180, seed: int = 42,
    ):
        if arch not in NETS:
            raise ValueError(f"unknown architecture {arch!r}; choose from {list(NETS)}")
        self.arch, self.epochs, self.batch_size, self.lr = arch, epochs, batch_size, lr
        self.weight_decay, self.patience, self.time_budget_s, self.seed = weight_decay, patience, time_budget_s, seed

    def _inputs(self, X) -> torch.Tensor:
        return torch.from_numpy(np.asarray(self.prep.transform(X), dtype=np.float32))

    @staticmethod
    def _loss(net, X, y, device, batch=8192) -> float:
        net.eval()
        total = 0.0
        with torch.no_grad():
            for i in range(0, len(X), batch):
                out = net(X[i : i + batch].to(device))
                total += float(((out - y[i : i + batch].to(device)) ** 2).sum())
        return total / len(X)

    def fit(self, X, y, X_valid=None, y_valid=None):
        torch.manual_seed(self.seed)
        rng = np.random.default_rng(self.seed)
        y = np.asarray(y, dtype=np.float32) / 100.0

        if X_valid is None:  # hold out 10% of train for early stopping
            idx = rng.permutation(len(X))
            cut = max(1, len(X) // 10)
            X_valid, y_valid_scaled = X.iloc[idx[:cut]], y[idx[:cut]]
            X, y = X.iloc[idx[cut:]], y[idx[cut:]]
        else:
            y_valid_scaled = np.asarray(y_valid, dtype=np.float32) / 100.0

        self.prep = make_preprocessor(len(X)).fit(X)
        Xt, yt = self._inputs(X), torch.from_numpy(y)
        Xv, yv = self._inputs(X_valid), torch.from_numpy(y_valid_scaled)

        device = get_device()
        self.n_inputs = Xt.shape[1]
        net = NETS[self.arch](self.n_inputs).to(device)
        opt = torch.optim.AdamW(net.parameters(), lr=self.lr, weight_decay=self.weight_decay)
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5, patience=2)
        loss_fn = nn.MSELoss()
        Xt_d, yt_d = Xt.to(device), yt.to(device)

        best_loss, best_state, bad_epochs = float("inf"), None, 0
        start, self.epochs_run, self.stopped_by = time.time(), 0, "max_epochs"
        for epoch in range(self.epochs):
            net.train()
            perm = torch.from_numpy(rng.permutation(len(Xt))).to(device)
            for step, i in enumerate(range(0, len(perm), self.batch_size)):
                batch = perm[i : i + self.batch_size]
                if len(batch) < 2:  # BatchNorm needs at least 2 rows
                    continue
                opt.zero_grad()
                loss = loss_fn(net(Xt_d[batch]), yt_d[batch])
                loss.backward()
                opt.step()
                if step % 50 == 0 and time.time() - start > self.time_budget_s:
                    break

            val_loss = self._loss(net, Xv, yv, device)
            scheduler.step(val_loss)
            self.epochs_run = epoch + 1
            if val_loss < best_loss - 1e-6:
                best_loss, bad_epochs = val_loss, 0
                best_state = copy.deepcopy({k: v.detach().cpu() for k, v in net.state_dict().items()})
            else:
                bad_epochs += 1
            if bad_epochs >= self.patience:
                self.stopped_by = "early_stopping"
                break
            if time.time() - start > self.time_budget_s:
                self.stopped_by = "time_budget"
                break

        net.load_state_dict(best_state)
        self.net = net.cpu().eval()
        self.best_valid_mse = best_loss
        if device.type == "mps":
            torch.mps.empty_cache()
        return self

    def predict(self, X) -> np.ndarray:
        Xp = self._inputs(X)
        with torch.no_grad():
            out = [self.net(Xp[i : i + 8192]).numpy() for i in range(0, len(Xp), 8192)]
        return np.concatenate(out) * 100.0
