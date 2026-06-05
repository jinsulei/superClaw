"""Verify a local SuperClaw portable package."""
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
pkg = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (root / "SuperClaw_USB")

if not pkg.is_dir():
    print("[ERROR] Package directory not found: " + str(pkg))
    sys.exit(1)

print("=== Checking for stale openclaw.json ===")
found = False
for root, dirs, files in os.walk(pkg):
    for f in files:
        if f == "openclaw.json":
            fp = os.path.join(root, f)
            print("  FOUND: " + fp)
            found = True
            break
    if found:
        break
if not found:
    print("  [OK] No openclaw.json found (will be regenerated on first run)")

print()
print("=== .openclaw/ contents ===")
dot_openclaw = pkg / "resources" / "data" / ".openclaw"
for item in sorted(os.listdir(dot_openclaw)):
    item_path = dot_openclaw / item
    if os.path.isdir(item_path):
        print("  [DIR]  " + item)
    else:
        fsize = os.path.getsize(item_path)
        print("  [FILE] " + item + " (" + str(fsize) + " bytes)")

print()
print("=== Hardcoded path scan ===")
hardcoded_files = []
needles = []
userprofile = os.environ.get("USERPROFILE")
if userprofile:
    needles.extend([userprofile, userprofile.replace("\\", "/")])
project_root = str(root)
needles.extend([project_root, project_root.replace("\\", "/")])

for root, dirs, files in os.walk(pkg):
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if ext in (".json", ".bat", ".cmd", ".cfg", ".ps1"):
            fp = os.path.join(root, f)
            try:
                with open(fp, "r", errors="ignore") as fh:
                    content = fh.read()
                    if any(needle and needle in content for needle in needles):
                        hardcoded_files.append(fp)
            except Exception as e:
                print("  [ERR] " + fp + ": " + str(e))

if hardcoded_files:
    print("  [WARN] Found current-machine hardcoded paths in:")
    for fp in hardcoded_files:
        print("    " + fp)
else:
    print("  [OK] No current-machine hardcoded paths found")

print()
print("=== superclaw.exe ===")
exe = pkg / "superclaw.exe"
size_mb = os.path.getsize(exe) / 1048576.0
print("  Size: {:.1f} MB".format(size_mb))

print()
print("Package: " + str(pkg))
print("Verification complete.")
