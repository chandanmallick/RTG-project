import urllib.request
import re

url = "https://docs.google.com/spreadsheets/d/1m6OpsvScoZ4IpdT6_SfJHAdliV_rgguaN-xoLGhm6ME/edit?gid=1368408280"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req).read().decode("utf-8", errors="ignore")

# Find sheet names and ids
names = re.findall(r'name:\s*"([^"]+)"', html)
gids = re.findall(r'gid:\s*"(\d+)"', html)
print(f"Names found: {len(names)}, Gids found: {len(gids)}")
for n in names[:25]:
    print("  Sheet name:", n)

