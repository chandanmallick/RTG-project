import { useEffect, useState } from "react";

import {
  Box,
  Grid,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Checkbox,
} from "@mui/material";

import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";

import API from "../services/api";

// LAYOUT
import AppShell from "../components/layout/AppShell";
import PlantMappingGrid from "../components/PlantMappingGrid";

// UI
import GradientButton from "../components/ui/GradientButton";
import StatCard from "../components/ui/StatCard";
import PremiumTable from "../components/ui/PremiumTable";
import SectionAccordion from "../components/ui/SectionAccordion";
import PremiumInput from "../components/ui/PremiumInput";
import StatusChip from "../components/ui/StatusChip";
import GlassCard from "../components/ui/GlassCard";

// POPUP
import { showModernPopup } from "../components/ui/ModernPopup";

export default function DatabaseSync() {
  // =====================================
  // STATES
  // =====================================

  const [data, setData] = useState([]);

  const [selected, setSelected] =
    useState([]);

  const [stageData, setStageData] =
    useState([]);

  const [mapData, setMapData] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [unitSearch, setUnitSearch] =
    useState("");

  const [stageSearch, setStageSearch] =
    useState("");

  const [stationSearch, setStationSearch] =
    useState("");

  const [stateSearch, setStateSearch] =
    useState("");

  // =====================================
  // FETCH MAP TABLE
  // =====================================

  const fetchMapData = async () => {
    try {
      const res =
        await API.fetchMapTable();

      setMapData(res?.data || []);
    } catch (err) {
      console.error(err);

      showModernPopup({
        type: "error",
        title: "Map Table",
        subtitle: "Unable To Load",
      });
    }
  };

  // =====================================
  // FETCH CHANGES
  // =====================================

  const fetchData = async () => {
    try {
      setLoading(true);

      const res =
        await API.fetchDbChanges();

      setData(res?.changes || []);

      await fetchMapData();

      showModernPopup({
        type: "success",
        title: "Database Sync",
        subtitle:
          "Latest Changes Loaded",
      });
    } catch (err) {
      console.error(err);

      showModernPopup({
        type: "error",
        title: "Fetch Failed",
        subtitle: "Unable To Fetch",
      });
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // SELECT
  // =====================================

  const toggleSelect = (row) => {
    const id = row.Unit_Number;

    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  const selectAll = (e) => {
    if (e.target.checked) {
      setSelected(
        data.map((d) => d.Unit_Number)
      );
    } else {
      setSelected([]);
    }
  };

  // =====================================
  // COMMIT UNIT DATA
  // =====================================

  const commit = async () => {
    try {
      if (selected.length === 0) {
        showModernPopup({
          type: "info",
          title: "No Selection",
          subtitle:
            "Please Select Records",
        });

        return;
      }

      setLoading(true);

      const selectedRows = data.filter(
        (d) =>
          selected.includes(d.Unit_Number)
      );

      const res =
        await API.commitDbChanges(
          selectedRows
        );

      if (res?.success) {
        showModernPopup({
          type: "success",
          title: "Database Updated",
          subtitle:
            "Records Successfully Synced",
        });

        // REMOVE COMMITTED ROWS

        setData((prev) =>
          prev.filter(
            (d) =>
              !selected.includes(
                d.Unit_Number
              )
          )
        );

        setSelected([]);

        // AUTO REFRESH STAGE

        await compareStageTable();

        await fetchMapData();
      }
    } catch (err) {
      console.error(err);

      showModernPopup({
        type: "error",
        title: "Commit Failed",
        subtitle: "Unable To Save",
      });
    } finally {
      setLoading(false);
    }
  };

  // =====================================
  // COMPARE STAGE
  // =====================================

  const compareStageTable =
    async () => {
      try {
        const res =
          await API.previewMapChanges();

        const rows =
          res?.changes || [];

        setStageData(rows);

        if (rows.length === 0) {
          showModernPopup({
            type: "info",
            title: "Station Mapping",
            subtitle:
              "No New Changes",
          });
        } else {
          showModernPopup({
            type: "success",
            title: "Mapping Compare",
            subtitle: `${rows.length} Changes Found`,
          });
        }
      } catch (err) {
        console.error(err);
      }
    };

  // =====================================
  // COMMIT STAGE
  // =====================================

  const commitStageTable =
    async () => {
      try {
        const res =
          await API.commitMapChanges();

        if (res?.success) {
          showModernPopup({
            type: "success",
            title: "Station Mapping",
            subtitle:
              "Successfully Updated",
          });

          setStageData([]);

          await fetchMapData();
        }
      } catch (err) {
        console.error(err);

        showModernPopup({
          type: "error",
          title: "Mapping Failed",
          subtitle:
            "Unable To Update",
        });
      }
    };

  // =====================================
  const saveMapTable = async (dirtyRows) => {
    try {
      setLoading(true);

      const payload = (dirtyRows || mapData).map(
        (row) => ({
          ...row,
        })
      );

      const res =
        await API.saveMapTable(payload);

      if (res?.success) {
        showModernPopup({
          type: "success",
          title: "Mapping Saved",
          subtitle:
            "Successfully Updated",
        });

        await fetchMapData();
      }
    } catch (err) {
      console.error(err);

      showModernPopup({
        type: "error",
        title: "Save Failed",
        subtitle:
          "Unable To Save Mapping",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredUnitData = data.filter(
    (row) =>
      JSON.stringify(row)
        .toLowerCase()
        .includes(
          unitSearch.toLowerCase()
        )
  );

  const filteredStageData =
    stageData.filter((row) =>
      JSON.stringify(row)
        .toLowerCase()
        .includes(
          stageSearch.toLowerCase()
        )
    );

  // =====================================
  // INIT
  // =====================================

  useEffect(() => {
    fetchMapData();
  }, []);

  return (
    <AppShell>
      {/* HERO */}

      <GlassCard
        sx={{
          mb: 1.8,
          p: 2,
          background:
            "linear-gradient(135deg, #022726 0%, #03624C 50%, #17876D 100%)",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, flexWrap: "wrap" }}>
            <Typography
              sx={{
                fontSize: 24,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              RTG Data Sync Portal
            </Typography>
            <Typography
              sx={{
                fontSize: 13,
                opacity: 0.85,
                fontWeight: 700,
              }}
            >
              Master Database Sync & Mapping
            </Typography>
          </Box>
        </Box>
      </GlassCard>

      {/* ===================================== */}
      {/* DATA CHANGES */}
      {/* ===================================== */}

      <SectionAccordion
        title="Data Changes"
        subtitle="Detected unit-wise updates"
        count={data.length}
        actions={
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            {/* KPI MINI TAGS */}

            <Box
              sx={{
                display: "flex",
                gap: 1.2,
                mr: 1,
              }}
            >
              {/* TOTAL */}

              <GlassCard
                hover={false}
                glow={false}
                padding={1}
                sx={{
                  minWidth: 110,
                  background:
                    "rgba(255,255,255,0.12)",
                  color: "#fff",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                <Typography
                  sx={{
                    fontSize: 11,
                    opacity: 0.7,
                  }}
                >
                  Total
                </Typography>

                <Typography
                  sx={{
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  {data.length}
                </Typography>
              </GlassCard>

              {/* NEW */}

              <GlassCard
                hover={false}
                glow={false}
                padding={1}
                sx={{
                  minWidth: 110,
                  background:
                    "rgba(34,197,94,0.18)",
                  color: "#fff",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                <Typography
                  sx={{
                    fontSize: 11,
                    opacity: 0.7,
                  }}
                >
                  New
                </Typography>

                <Typography
                  sx={{
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  {
                    data.filter(
                      (x) =>
                        x.change_type ===
                        "NEW"
                    ).length
                  }
                </Typography>
              </GlassCard>

              {/* MODIFIED */}

              <GlassCard
                hover={false}
                glow={false}
                padding={1}
                sx={{
                  minWidth: 110,
                  background:
                    "rgba(245,158,11,0.18)",
                  color: "#fff",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                <Typography
                  sx={{
                    fontSize: 11,
                    opacity: 0.7,
                  }}
                >
                  Modified
                </Typography>

                <Typography
                  sx={{
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  {
                    data.filter(
                      (x) =>
                        x.change_type ===
                        "MODIFIED"
                    ).length
                  }
                </Typography>
              </GlassCard>
            </Box>

            <Box
              sx={{
                width: 260,
              }}
            >
              <PremiumInput
                placeholder="Search changes..."
                value={unitSearch}
                onChange={(e) =>
                  setUnitSearch(
                    e.target.value
                  )
                }
                sx={{
                  "& .MuiOutlinedInput-root": {
                    background:
                      "rgba(255,255,255,0.14)",

                    color: "#fff",

                    backdropFilter:
                      "blur(14px)",

                    "& fieldset": {
                      borderColor:
                        "rgba(255,255,255,0.18)",
                    },
                  },

                  "& input": {
                    color: "#fff",
                  },

                  "& input::placeholder": {
                    color:
                      "rgba(255,255,255,0.65)",
                    opacity: 1,
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <SearchRoundedIcon
                      sx={{
                        mr: 1,
                        fontSize: 18,
                        opacity: 0.7,
                      }}
                    />
                  ),
                }}
              />
            </Box>

            {/* ACTION BUTTONS */}

            <GradientButton
              variant="glass"
              startIcon={<SyncRoundedIcon />}
              onClick={(e) => {
                e.stopPropagation();
                fetchData();
              }}
            >
              {loading
                ? "Fetching..."
                : "Fetch Data"}
            </GradientButton>

            <GradientButton
              color="success"
              startIcon={<SaveRoundedIcon />}
              onClick={(e) => {
                e.stopPropagation();
                commit();
              }}
            >
              Commit Changes
            </GradientButton>
          </Box>
        }
      >
        <PremiumTable maxHeight="30vh">
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={
                      data.length > 0 &&
                      selected.length ===
                        data.length
                    }
                    onChange={selectAll}
                  />
                </TableCell>

                <TableCell>
                  Plant
                </TableCell>

                <TableCell>
                  Unit
                </TableCell>

                <TableCell>
                  Stage
                </TableCell>

                <TableCell>
                  Capacity
                </TableCell>

                <TableCell>
                  State
                </TableCell>

                <TableCell>
                  Owner
                </TableCell>

                <TableCell>
                  Fuel
                </TableCell>

                <TableCell>
                  Change
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {(filteredUnitData || []).map(
                (row, i) => (
                  <TableRow
                    hover
                    key={i}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.includes(
                          row.Unit_Number
                        )}
                        onChange={() =>
                          toggleSelect(
                            row
                          )
                        }
                      />
                    </TableCell>

                    <TableCell>
                      {
                        row.plant_name
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.Unit_Name
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.STAGE_NAME
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.installed_capacity
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.state_name
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.owner_name
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.fuel_type
                      }
                    </TableCell>

                    <TableCell>
                      <StatusChip
                        type={
                          row.change_type
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </PremiumTable>
      </SectionAccordion>

      {/* ===================================== */}
      {/* STAGE PREVIEW */}
      {/* ===================================== */}

      <SectionAccordion
        title="Station Mapping Preview"
        subtitle="Consolidated stage compare"
        count={stageData.length}
        actions={
          <Box
            sx={{
              display: "flex",
              gap: 1.5,
            }}
          >
            <GradientButton
              variant="glass"
              onClick={(e) => {
                e.stopPropagation();

                compareStageTable();
              }}
            >
              Compare Mapping
            </GradientButton>

            <GradientButton
              color="success"
              onClick={(e) => {
                e.stopPropagation();

                commitStageTable();
              }}
            >
              Confirm Update
            </GradientButton>
          </Box>
        }
      >
        <PremiumTable maxHeight="25vh">
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>
                  Plant
                </TableCell>

                <TableCell>
                  Stage
                </TableCell>

                <TableCell>
                  Owner
                </TableCell>

                <TableCell>
                  Capacity
                </TableCell>

                <TableCell>
                  Change
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {(filteredStageData || []).map(
                (row, i) => (
                  <TableRow
                    key={i}
                    hover
                  >
                    <TableCell>
                      {
                        row.plant_name
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.STAGE_NAME
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.owner_name
                      }
                    </TableCell>

                    <TableCell>
                      {
                        row.stage_installed_capacity
                      }
                    </TableCell>

                    <TableCell>
                      <StatusChip
                        type={
                          row.change_type
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </PremiumTable>
      </SectionAccordion>

      {/* ===================================== */}
      {/* MAP TABLE */}
      {/* ===================================== */}

      <SectionAccordion
        title="Station Mapping Table"
        subtitle="Editable station mapping"
        count={mapData.filter(r => !r.is_state).length}
        actions={
          <Box sx={{ width: 260 }} onClick={(e) => e.stopPropagation()}>
            <PremiumInput
              placeholder="Search stations..."
              value={stationSearch}
              onChange={(e) => setStationSearch(e.target.value)}
              sx={{
                "& .MuiOutlinedInput-root": {
                  background: "rgba(255,255,255,0.14)",
                  color: "#fff",
                  backdropFilter: "blur(14px)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.18)" },
                },
                "& input": { color: "#fff" },
                "& input::placeholder": { color: "rgba(255,255,255,0.65)" },
              }}
              InputProps={{
                startAdornment: (
                  <SearchRoundedIcon sx={{ mr: 1, fontSize: 18, opacity: 0.7 }} />
                ),
              }}
            />
          </Box>
        }
      >
        <Box sx={{ p: 0.5 }}>
          <PlantMappingGrid
            data={mapData.filter(r => !r.is_state)}
            loading={loading}
            onSave={saveMapTable}
            maxHeight="40vh"
            searchText={stationSearch}
          />
        </Box>
      </SectionAccordion>

      <SectionAccordion
        title="State & System Mapping Table"
        subtitle="Editable state & system frequency mapping"
        count={mapData.filter(r => r.is_state).length}
        actions={
          <Box sx={{ width: 260 }} onClick={(e) => e.stopPropagation()}>
            <PremiumInput
              placeholder="Search states..."
              value={stateSearch}
              onChange={(e) => setStateSearch(e.target.value)}
              sx={{
                "& .MuiOutlinedInput-root": {
                  background: "rgba(255,255,255,0.14)",
                  color: "#fff",
                  backdropFilter: "blur(14px)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.18)" },
                },
                "& input": { color: "#fff" },
                "& input::placeholder": { color: "rgba(255,255,255,0.65)" },
              }}
              InputProps={{
                startAdornment: (
                  <SearchRoundedIcon sx={{ mr: 1, fontSize: 18, opacity: 0.7 }} />
                ),
              }}
            />
          </Box>
        }
      >
        <Box sx={{ p: 0.5 }}>
          <PlantMappingGrid
            data={mapData.filter(r => r.is_state)}
            loading={loading}
            onSave={saveMapTable}
            maxHeight="30vh"
            searchText={stateSearch}
          />
        </Box>
      </SectionAccordion>

      {/* Spacing spacer for easy scrolling to the bottom */}
      <Box sx={{ height: 80, flexShrink: 0 }} />
    </AppShell>
  );
}