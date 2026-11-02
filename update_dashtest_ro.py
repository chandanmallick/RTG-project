with open('frontend/src/crewLegacy/DashTest.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update Top Banner title and button
old_banner = '''            <Typography fontSize={13.5} fontWeight={900} color="#92400E">
              Duty Replacement Pending Your Review
            </Typography>
            <Typography fontSize={11.5} color="#78350F">
              {dutyNotifs.filter(n => n.canAccept || n.canDeny).map(n => `${n.employeeName} (${dayjs(n.date).format("DD-MMM")} · ${n.assignedDuty})`).join(", ")}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            onClick={() => setDutyFullListOpen(true)}
            sx={{
              bgcolor: "#D97706",
              "&:hover": { bgcolor: "#B45309" },
              textTransform: "none",
              fontWeight: 900,
              fontSize: 12,
              borderRadius: 2,
              px: 1.8,
            }}
          >
            Review & Decide (Accept / Deny) ↗
          </Button>'''

new_banner = '''            <Typography fontSize={13.5} fontWeight={900} color="#92400E">
              {dutyNotifs.some(n => n.canDeny) ? "Duty Replacement Pending Your Review" : "Duty Replacement Pending Your Acceptance"}
            </Typography>
            <Typography fontSize={11.5} color="#78350F">
              {dutyNotifs.filter(n => n.canAccept || n.canDeny).map(n => `${n.employeeName} (${dayjs(n.date).format("DD-MMM")} · ${n.assignedDuty})`).join(", ")}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            onClick={() => setDutyFullListOpen(true)}
            sx={{
              bgcolor: "#D97706",
              "&:hover": { bgcolor: "#B45309" },
              textTransform: "none",
              fontWeight: 900,
              fontSize: 12,
              borderRadius: 2,
              px: 1.8,
            }}
          >
            {dutyNotifs.some(n => n.canDeny) ? "Review & Decide (Accept / Deny) ↗" : "Review & Accept Duty ↗"}
          </Button>'''

# 2. Update landscape reallocation buttons to require isAdmin
old_landscape_realloc = '''                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/crew/replacement?tab=duty&date=${n.date}&shift=${n.assignedDuty}`);
                            }}
                            sx={{
                              fontSize: 11,
                              fontWeight: 850,
                              textTransform: "none",
                              color: "#1E3A8A",
                              borderColor: "#93C5FD",
                              bgcolor: "#EFF6FF",
                              "&:hover": { bgcolor: "#DBEAFE" },
                            }}
                          >
                            Allocate Another Duty ↗
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={reallocatingId === n._id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAutoReallocate(n._id);
                            }}
                            sx={{
                              fontSize: 11,
                              fontWeight: 900,
                              textTransform: "none",
                              bgcolor: "#DC2626",
                              "&:hover": { bgcolor: "#B91C1C" },
                            }}
                          >
                            {reallocatingId === n._id ? "Allocating..." : "Auto Sequential Allocate ⚡"}
                          </Button>
                        </Stack>'''

new_landscape_realloc = '''                        {isAdmin && (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/crew/replacement?tab=duty&date=${n.date}&shift=${n.assignedDuty}`);
                              }}
                              sx={{
                                fontSize: 11,
                                fontWeight: 850,
                                textTransform: "none",
                                color: "#1E3A8A",
                                borderColor: "#93C5FD",
                                bgcolor: "#EFF6FF",
                                "&:hover": { bgcolor: "#DBEAFE" },
                              }}
                            >
                              Allocate Another Duty ↗
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={reallocatingId === n._id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAutoReallocate(n._id);
                              }}
                              sx={{
                                fontSize: 11,
                                fontWeight: 900,
                                textTransform: "none",
                                bgcolor: "#DC2626",
                                "&:hover": { bgcolor: "#B91C1C" },
                              }}
                            >
                              {reallocatingId === n._id ? "Allocating..." : "Auto Sequential Allocate ⚡"}
                            </Button>
                          </Stack>
                        )}'''

# 3. Update full list dialog reallocation buttons to require isAdmin
old_popup_realloc = '''              <Stack direction="row" spacing={1} sx={{ mt: 1.2, pt: 1, borderTop: "1px dashed #FECACA" }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setDutyFullListOpen(false);
                    navigate(`/crew/replacement?tab=duty&date=${n.date}&shift=${n.assignedDuty}`);
                  }}
                  sx={{
                    fontSize: 11,
                    fontWeight: 850,
                    textTransform: "none",
                    color: "#1E3A8A",
                    borderColor: "#93C5FD",
                    bgcolor: "#EFF6FF",
                    "&:hover": { bgcolor: "#DBEAFE" },
                  }}
                >
                  Allocate Another Duty ↗
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={reallocatingId === n._id}
                  onClick={() => handleAutoReallocate(n._id)}
                  sx={{
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: "none",
                    bgcolor: "#DC2626",
                    "&:hover": { bgcolor: "#B91C1C" },
                  }}
                >
                  {reallocatingId === n._id ? "Allocating..." : "Auto Sequential Allocate ⚡"}
                </Button>
              </Stack>'''

new_popup_realloc = '''              {isAdmin && (
                <Stack direction="row" spacing={1} sx={{ mt: 1.2, pt: 1, borderTop: "1px dashed #FECACA" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setDutyFullListOpen(false);
                      navigate(`/crew/replacement?tab=duty&date=${n.date}&shift=${n.assignedDuty}`);
                    }}
                    sx={{
                      fontSize: 11,
                      fontWeight: 850,
                      textTransform: "none",
                      color: "#1E3A8A",
                      borderColor: "#93C5FD",
                      bgcolor: "#EFF6FF",
                      "&:hover": { bgcolor: "#DBEAFE" },
                    }}
                  >
                    Allocate Another Duty ↗
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={reallocatingId === n._id}
                    onClick={() => handleAutoReallocate(n._id)}
                    sx={{
                      fontSize: 11,
                      fontWeight: 900,
                      textTransform: "none",
                      bgcolor: "#DC2626",
                      "&:hover": { bgcolor: "#B91C1C" },
                    }}
                  >
                    {reallocatingId === n._id ? "Allocating..." : "Auto Sequential Allocate ⚡"}
                  </Button>
                </Stack>
              )}'''

# 4. Update canRevert button to require isAdmin
old_can_revert_btn = '''                {n.canRevert && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => handleRevertAssignment(n)}'''

new_can_revert_btn = '''                {n.canRevert && isAdmin && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => handleRevertAssignment(n)}'''

code_norm = code.replace('\r\n', '\n')
errors = []

for name, target, repl in [
    ("banner", old_banner, new_banner),
    ("landscape_realloc", old_landscape_realloc, new_landscape_realloc),
    ("popup_realloc", old_popup_realloc, new_popup_realloc),
    ("can_revert_btn", old_can_revert_btn, new_can_revert_btn),
]:
    target_norm = target.replace('\r\n', '\n')
    if target_norm in code_norm:
        code_norm = code_norm.replace(target_norm, repl)
        print(f"Replaced {name}")
    else:
        errors.append(name)
        print(f"FAILED {name}")

if not errors:
    if '\r\n' in code:
        code_norm = code_norm.replace('\n', '\r\n')
    with open('frontend/src/crewLegacy/DashTest.jsx', 'w', encoding='utf-8') as f:
        f.write(code_norm)
    print("ALL SUCCESS")
else:
    print("ERRORS:", errors)
