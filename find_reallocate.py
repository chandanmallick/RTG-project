with open('frontend/src/crewLegacy/DashTest.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'reallocat' in line.lower() or 'revert' in line.lower():
        print(f"{i+1}: {line.strip()}")
