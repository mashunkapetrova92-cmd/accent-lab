"""Mirror the built site (dist/) into the GitHub Pages repository folder, plus the docs and the token server."""
import os, shutil, filecmp, sys
DIST = os.environ.get("DIST", "/home/claude/accent-lab/dist"); REPO = "/home/claude/repo-push"; SRC = "/home/claude/accent-lab"
KEEP = {".git", ".nojekyll"}
EXTRA = {"README.md": f"{SRC}/README.md", "SETUP-RU.md": f"{SRC}/SETUP-RU.md", "server/token-worker.js": f"{SRC}/server/token-worker.js"}
want = {}
for root, dirs, files in os.walk(DIST):
    rel = os.path.relpath(root, DIST)
    if rel.split(os.sep)[0] == "test": continue  # test recordings are never published
    for f in files:
        r = os.path.normpath(os.path.join(rel, f)); want[r] = os.path.join(root, f)
for r, p in EXTRA.items(): want[r] = p
removed = copied = 0
for root, dirs, files in os.walk(REPO):
    rel = os.path.relpath(root, REPO)
    if rel.split(os.sep)[0] in KEEP: continue
    for f in files:
        r = os.path.normpath(os.path.join(rel, f))
        if r.split(os.sep)[0] in KEEP: continue
        if r not in want: os.remove(os.path.join(root, f)); removed += 1
for r, p in want.items():
    dst = os.path.join(REPO, r)
    if os.path.exists(dst) and filecmp.cmp(p, dst, shallow=False): continue
    os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(p, dst); copied += 1
# drop empty folders
for root, dirs, files in os.walk(REPO, topdown=False):
    if ".git" in root.split(os.sep): continue
    if root != REPO and not os.listdir(root): os.rmdir(root)
open(os.path.join(REPO, ".nojekyll"), "a").close()
print("copied", copied, "removed", removed, "files now", len(want))
