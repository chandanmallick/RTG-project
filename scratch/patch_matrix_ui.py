with open('frontend/src/components/crew/SpecialRosterMatrix.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add state
state_target = '  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");'
state_insert = '''  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");
  const [syncingGoogleSheet, setSyncingGoogleSheet] = useState(false);

  const handleSyncGoogleSheet = async () => {
    setSyncingGoogleSheet(true);
    try {
      const d = dayjs(startDate || new Date());
      const res = await api.post("/google-sheet/sync-month", {
        year: d.year(),
        month: d.month() + 1,
      });
      setNotice({
        severity: "success",
        text: res.data?.message || "Google Sheet updated successfully!",
      });
    } catch (err) {
      setNotice({
        severity: "error",
        text: err.response?.data?.detail || "Google Sheet sync failed.",
      });
    } finally {
      setSyncingGoogleSheet(false);
    }
  };'''

button_target = '''            <Button
              variant="outlined"
              startIcon={<RefreshCw size={14} className={loading ? "spin" : ""} />}
              onClick={() => loadMatrix()}
              sx={{
                borderColor: "#CBD5E1",
                color: "#334155",
                fontWeight: 800,
                borderRadius: 2.5,
                textTransform: "none",
              }}
            >
              Refresh
            </Button>'''

button_insert = '''            <Button
              variant="outlined"
              startIcon={<RefreshCw size={14} className={loading ? "spin" : ""} />}
              onClick={() => loadMatrix()}
              sx={{
                borderColor: "#CBD5E1",
                color: "#334155",
                fontWeight: 800,
                borderRadius: 2.5,
                textTransform: "none",
              }}
            >
              Refresh
            </Button>

            <Button
              variant="outlined"
              startIcon={syncingGoogleSheet ? <CircularProgress size={13} color="inherit" /> : <ExternalLink size={14} />}
              onClick={handleSyncGoogleSheet}
              disabled={syncingGoogleSheet}
              sx={{
                borderColor: "#059669",
                color: "#059669",
                fontWeight: 800,
                borderRadius: 2.5,
                textTransform: "none",
                bgcolor: "#F0FDF4",
                "&:hover": { bgcolor: "#DCFCE7", borderColor: "#047857" },
              }}
            >
              {syncingGoogleSheet ? "Syncing..." : "Sync Google Sheet"}
            </Button>'''

if state_target in content and button_target in content:
    content = content.replace(state_target, state_insert, 1)
    content = content.replace(button_target, button_insert, 1)
    with open('frontend/src/components/crew/SpecialRosterMatrix.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Updated SpecialRosterMatrix.jsx successfully')
else:
    print('Target match failed:', state_target in content, button_target in content)

