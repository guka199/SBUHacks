"""Train and score one model in its own fresh process (used by ml/benchmark.py).

Why: on macOS, PyTorch and XGBoost/LightGBM ship different OpenMP runtimes, and using both in one
process deadlocks or segfaults (tested: either order). A fresh process per model avoids that, frees
all memory afterwards, and lets the benchmark survive a model that crashes or hangs (hard timeout).
"""

import multiprocessing as mp
import time
import traceback
import warnings

import numpy as np


def _fit_and_predict(name, options, X_train, y_train, X_valid, y_valid, X_test, train_idx, conn) -> None:
    """Runs in the child process; sends back predictions + timings (never raises)."""
    try:
        warnings.simplefilter("ignore")
        from ml.models import MODELS

        start = time.perf_counter()
        model = MODELS[name].make(options).fit(X_train, y_train, X_valid, y_valid)
        fit_seconds = time.perf_counter() - start

        pred = np.asarray(model.predict(X_test), dtype=float)
        start = time.perf_counter()
        for _ in range(5):
            model.predict(X_test.iloc[:1])
        ms_per_post = (time.perf_counter() - start) / 5 * 1000
        pred_train = np.asarray(model.predict(X_train.iloc[train_idx]), dtype=float)

        conn.send({"ok": True, "fit_seconds": fit_seconds, "pred": pred, "pred_train": pred_train,
                   "ms_per_post": ms_per_post})
    except BaseException:
        conn.send({"ok": False, "error": traceback.format_exc()})
    finally:
        conn.close()


def run_isolated(name: str, options: dict, m, train_idx: np.ndarray, timeout_s: float) -> dict:
    """{'ok': True, 'pred', 'pred_train', 'fit_seconds', 'ms_per_post'} or {'ok': False, 'error'}."""
    ctx = mp.get_context("spawn")
    receive, send = ctx.Pipe(duplex=False)
    proc = ctx.Process(
        target=_fit_and_predict,
        args=(name, options, m.X_train, m.y_train, m.X_valid, m.y_valid, m.X_test, train_idx, send),
    )
    proc.start()
    send.close()  # only the child writes
    try:
        if receive.poll(timeout_s):
            result = receive.recv()
        else:
            result = {"ok": False, "error": f"timed out after {timeout_s:.0f}s"}
    except EOFError:  # child died without answering (segfault, out of memory, ...)
        proc.join(5)
        result = {"ok": False, "error": f"process crashed (exit code {proc.exitcode})"}
    finally:
        receive.close()
        proc.join(10)
        if proc.is_alive():
            proc.kill()
            proc.join()
    return result
