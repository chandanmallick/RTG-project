import { useEffect, useRef, useState, useMemo } from "react";
import { Map, NavigationControl, Marker, Popup } from "../vendor/maplibre-gl/maplibre-gl.mjs";
import "../vendor/maplibre-gl/maplibre-gl.css";
import {
  Zap,
  Layers,
  Search,
  ExternalLink,
  MapPin,
  Compass,
  Maximize2,
  Minimize2,
  RotateCcw,
  Shield,
  Eye,
  Info,
  Sliders,
  Check,
  ChevronRight,
  Radio,
  Activity,
  Flame,
  Key,
  X,
  HelpCircle,
  AlertCircle,
  RefreshCw,
  Upload,
  Download,
  Database,
  CheckCircle2,
  AlertTriangle,
  Droplets,
  ArrowRight,
  Filter,
} from "lucide-react";
import TopNavbar from "../components/layout/TopNavbar";
import API from "../services/api";
import defaultGridGeoJson from "../data/power_map/eastern_region_power_grid.json";

// Base map style options (Watermark-free, zero-API-key defaults)
export const BASEMAP_PROVIDERS = [
  {
    id: "osm",
    label: "OpenStreetMap Standard",
    shortLabel: "OSM",
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
    requiresKey: false,
    badge: "Free • No Key",
    tiles: [
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    ],
    description: "Standard OpenStreetMap with towns, highways, and district boundaries.",
  },
  {
    id: "esri-gray",
    label: "Esri Light Gray Canvas",
    shortLabel: "Light",
    attribution: 'Tiles © <a href="https://www.esri.com/" target="_blank">Esri</a>, HERE, Garmin, © OpenStreetMap contributors',
    requiresKey: false,
    badge: "Free • No Key",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    description: "Minimalist light gray canvas. Gives maximum contrast for power transmission lines and substation badges.",
  },
  {
    id: "satellite",
    label: "Esri Satellite Imagery",
    shortLabel: "Satellite",
    attribution: 'Tiles © <a href="https://www.esri.com/" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
    requiresKey: false,
    badge: "Free • No Key",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    description: "High resolution aerial satellite imagery showing actual switchyards, terrain, and rivers.",
  },
  {
    id: "esri-topo",
    label: "Esri Topographic",
    shortLabel: "Topo",
    attribution: 'Tiles © <a href="https://www.esri.com/" target="_blank">Esri</a>, USGS',
    requiresKey: false,
    badge: "Free • No Key",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    description: "Topographic contours, terrain relief, and geographical landmarks.",
  },
  {
    id: "carto-voyager",
    label: "CARTO Voyager",
    shortLabel: "CARTO",
    attribution: '© <a href="https://carto.com/" target="_blank">CARTO</a>, © OpenStreetMap contributors',
    requiresKey: true,
    badge: "API Key Req.",
    getTiles: (key) => [
      `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${key ? `?key=${key}` : ""}`,
      `https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${key ? `?key=${key}` : ""}`,
      `https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${key ? `?key=${key}` : ""}`,
    ],
    description: "CARTO Voyager raster basemap. Requires free CARTO API key from carto.com/basemaps/apikey.",
  },
];

// State bounds for Eastern Region navigation
export const ER_STATE_BOUNDS = {
  all: [[81.0, 17.8], [89.9, 28.2]],
  "West Bengal": [[85.8, 21.5], [89.9, 27.3]],
  "Bihar": [[83.2, 24.5], [88.3, 27.5]],
  "Jharkhand": [[83.3, 21.9], [87.9, 25.3]],
  "Odisha": [[81.3, 17.8], [87.5, 22.6]],
  "Sikkim": [[88.0, 27.0], [88.9, 28.1]],
};

export default function WestBengalPowerMap() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // API Key & Basemap state
  const [cartoApiKey, setCartoApiKey] = useState(() => {
    return localStorage.getItem("rtg_carto_api_key") || import.meta.env.VITE_CARTO_API_KEY || "";
  });
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [tempKeyInput, setTempKeyInput] = useState(cartoApiKey);

  // Active Grid GeoJSON dataset
  const [gridData, setGridData] = useState(defaultGridGeoJson);
  const [datasetStatus, setDatasetStatus] = useState(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(null);

  // Active State Zoom Filter
  const [activeState, setActiveState] = useState("all");

  // CRMS Codebook Master Data Mapping state
  const [crmsModalOpen, setCrmsModalOpen] = useState(false);
  const [crmsLoading, setCrmsLoading] = useState(false);
  const [crmsElements, setCrmsElements] = useState([]);
  const [crmsIsLive, setCrmsIsLive] = useState(false);
  const [crmsMappings, setCrmsMappings] = useState({});
  const [crmsSearch, setCrmsSearch] = useState("");
  const [crmsCategoryFilter, setCrmsCategoryFilter] = useState("all");
  const [crmsStateFilter, setCrmsStateFilter] = useState("all");
  const [crmsDirty, setCrmsDirty] = useState(false);
  const [crmsSaveFeedback, setCrmsSaveFeedback] = useState(null);

  // Import file state
  const [importText, setImportText] = useState("");
  const [importingFile, setImportingFile] = useState(false);
  const fileInputRef = useRef(null);

  // UI state
  const [activeBaseMap, setActiveBaseMap] = useState("osm");
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'plants', 'substations', 'lines'
  const [searchQuery, setSearchQuery] = useState("");
  const [voltageFilter, setVoltageFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);

  // Layer toggles
  const [layersVisibility, setLayersVisibility] = useState({
    powerLines: true,
    powerPlants: true,
    substations: true,
    labels: true,
    liveOpenInfraTiles: false,
  });

  // Extract catalog entities from GeoJSON
  const { allPlants, allSubstations, allLines, totalCapacityMW } = useMemo(() => {
    const features = gridData?.features || [];
    const plants = [];
    const substations = [];
    const lines = [];
    let capacity = 0;

    features.forEach((feat) => {
      const p = feat.properties || {};
      const cat = p.category;
      if (cat === "power_plant") {
        plants.push({ ...p, coords: feat.geometry.coordinates });
        capacity += Number(p.capacity_mw) || 0;
      } else if (cat === "power_substation") {
        substations.push({ ...p, coords: feat.geometry.coordinates });
      } else if (cat === "power_line") {
        lines.push({ ...p, coords: feat.geometry.coordinates });
      }
    });

    return {
      allPlants: plants,
      allSubstations: substations,
      allLines: lines,
      totalCapacityMW: capacity,
    };
  }, [gridData]);

  // Filter entities according to search and filters
  const filteredPlants = useMemo(() => {
    return allPlants.filter((item) => {
      const matchSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.district && item.district.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.operator && item.operator.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.fuel && item.fuel.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchVoltage =
        voltageFilter === "all" ||
        (voltageFilter === "765" && item.voltage_class >= 765) ||
        (voltageFilter === "400" && item.voltage_class === 400) ||
        (voltageFilter === "220" && item.voltage_class === 220) ||
        (voltageFilter === "132" && item.voltage_class === 132);

      const matchOp =
        operatorFilter === "all" || (item.operator && item.operator.toUpperCase().includes(operatorFilter.toUpperCase()));

      return matchSearch && matchVoltage && matchOp;
    });
  }, [allPlants, searchQuery, voltageFilter, operatorFilter]);

  const filteredSubstations = useMemo(() => {
    return allSubstations.filter((item) => {
      const matchSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.district && item.district.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.operator && item.operator.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchVoltage =
        voltageFilter === "all" ||
        (voltageFilter === "765" && item.voltage_class >= 765) ||
        (voltageFilter === "400" && item.voltage_class === 400) ||
        (voltageFilter === "220" && item.voltage_class === 220) ||
        (voltageFilter === "132" && item.voltage_class === 132);

      const matchOp =
        operatorFilter === "all" || (item.operator && item.operator.toUpperCase().includes(operatorFilter.toUpperCase()));

      return matchSearch && matchVoltage && matchOp;
    });
  }, [allSubstations, searchQuery, voltageFilter, operatorFilter]);

  const filteredLines = useMemo(() => {
    return allLines.filter((item) => {
      const matchSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.operator && item.operator.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchVoltage =
        voltageFilter === "all" ||
        (voltageFilter === "765" && item.voltage_class >= 765) ||
        (voltageFilter === "400" && item.voltage_class === 400) ||
        (voltageFilter === "220" && item.voltage_class === 220) ||
        (voltageFilter === "132" && item.voltage_class === 132);

      const matchOp =
        operatorFilter === "all" || (item.operator && item.operator.toUpperCase().includes(operatorFilter.toUpperCase()));

      return matchSearch && matchVoltage && matchOp;
    });
  }, [allLines, searchQuery, voltageFilter, operatorFilter]);

  // Fetch live dataset, sync status, and CRMS mappings on mount
  useEffect(() => {
    const fetchRemoteData = async () => {
      try {
        const [dataRes, statusRes, crmsMapRes, crmsElemRes] = await Promise.allSettled([
          API.getPowerGridData(),
          API.getPowerGridStatus(),
          API.getCRMSMappings(),
          API.getCRMSCodebookElements("AC_TRANSMISSION_LINE_CIRCUIT"),
        ]);
        if (dataRes.status === "fulfilled" && dataRes.value?.features?.length > 0) {
          setGridData(dataRes.value);
        }
        if (statusRes.status === "fulfilled") {
          setDatasetStatus(statusRes.value);
        }
        if (crmsMapRes.status === "fulfilled" && crmsMapRes.value?.mappings) {
          const mObj = {};
          crmsMapRes.value.mappings.forEach((m) => {
            mObj[m.map_entity_id] = m.crms_element_name;
          });
          setCrmsMappings(mObj);
        }
        if (crmsElemRes.status === "fulfilled") {
          setCrmsElements(crmsElemRes.value?.elements || []);
          setCrmsIsLive(Boolean(crmsElemRes.value?.is_live));
        }
      } catch (err) {
        console.warn("Using bundled Eastern Region power grid dataset:", err);
      }
    };
    fetchRemoteData();
  }, []);

  // Fit map bounds to a state
  const handleStateZoom = (stateName) => {
    setActiveState(stateName);
    const map = mapRef.current;
    if (!map) return;
    const bounds = ER_STATE_BOUNDS[stateName] || ER_STATE_BOUNDS.all;
    map.fitBounds(bounds, { padding: 40, duration: 1200 });
  };

  // Open CRMS Modal & load fresh list if needed
  const handleOpenCrmsModal = async () => {
    setCrmsModalOpen(true);
    setCrmsSaveFeedback(null);
    if (!crmsElements || crmsElements.length === 0) {
      setCrmsLoading(true);
      try {
        const res = await API.getCRMSCodebookElements("AC_TRANSMISSION_LINE_CIRCUIT");
        setCrmsElements(res.elements || []);
        setCrmsIsLive(Boolean(res.is_live));
      } catch (e) {
        console.error("Failed to fetch CRMS elements:", e);
      } finally {
        setCrmsLoading(false);
      }
    }
  };

  // Auto-match map features to CRMS elements
  const handleAutoMatch = async () => {
    setCrmsLoading(true);
    try {
      const res = await API.autoMatchCRMSElements("AC_TRANSMISSION_LINE_CIRCUIT");
      if (res.matches) {
        const updated = { ...crmsMappings };
        let matchedCount = 0;
        res.matches.forEach((m) => {
          if (m.suggested_crms && !updated[m.map_entity_id]) {
            updated[m.map_entity_id] = m.suggested_crms;
            matchedCount++;
          }
        });
        setCrmsMappings(updated);
        setCrmsDirty(true);
        setCrmsSaveFeedback({
          type: "info",
          message: `Auto-matched ${matchedCount} new element(s) with CRMS Codebook! Click "Save All Mappings" to persist.`,
        });
      }
    } catch (e) {
      console.error("Auto match failed:", e);
    } finally {
      setCrmsLoading(false);
    }
  };

  // Save all mappings to DB
  const handleSaveCrmsMappings = async () => {
    setCrmsLoading(true);
    try {
      const payload = Object.entries(crmsMappings).map(([id, crmsName]) => {
        const feat = gridData.features.find((f) => (f.id || f.properties?.id) === id);
        return {
          map_entity_id: id,
          map_entity_name: feat?.properties?.name || id,
          map_entity_type: feat?.properties?.category || "transmission_line",
          voltage_class: feat?.properties?.voltage_class,
          crms_element_name: crmsName,
          crms_element_type: "AC_TRANSMISSION_LINE_CIRCUIT",
          mapped_by: "Operator",
        };
      });

      const res = await API.saveCRMSMappings(payload);
      if (res.success) {
        setCrmsDirty(false);
        setCrmsSaveFeedback({
          type: "success",
          message: `Successfully saved ${res.count} CRMS Codebook mapping(s) to master database!`,
        });

        // Also update active gridData in memory
        const updatedFeatures = gridData.features.map((f) => {
          const fid = f.id || f.properties?.id;
          if (crmsMappings[fid]) {
            return {
              ...f,
              properties: {
                ...f.properties,
                crms_codebook: crmsMappings[fid],
                crms_mapped: true,
              },
            };
          }
          return f;
        });
        setGridData({ ...gridData, features: updatedFeatures });
      }
    } catch (e) {
      setCrmsSaveFeedback({
        type: "danger",
        message: `Failed to save mappings: ${e.message}`,
      });
    } finally {
      setCrmsLoading(false);
    }
  };

  // Update GeoJSON source when gridData changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const src = map.getSource("wb-power-grid");
    if (src && src.setData) {
      src.setData(gridData);
    }
  }, [gridData, mapLoaded]);

  // Initialize MapLibre GL Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Eastern Region center (West Bengal, Bihar, Jharkhand, Odisha, Sikkim)
    const initialCenter = [85.8, 23.5];
    const initialZoom = 6.4;

    const activeProvider = BASEMAP_PROVIDERS.find((b) => b.id === activeBaseMap) || BASEMAP_PROVIDERS[0];
    const initialTiles = activeProvider.getTiles ? activeProvider.getTiles(cartoApiKey) : activeProvider.tiles;

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            "base-tiles": {
              type: "raster",
              tiles: initialTiles,
              tileSize: 256,
              attribution: activeProvider.attribution,
            },
            "wb-power-grid": {
              type: "geojson",
              data: gridData,
            },
            openinframap: {
              type: "vector",
              tiles: ["https://openinframap.org/tiles/{z}/{x}/{y}.pbf"],
              maxzoom: 17,
              attribution:
                '<a href="https://openinframap.org" target="_blank">Open Infrastructure Map</a> | <a href="https://maplibre.org" target="_blank">MapLibre</a>',
            },
          },
          layers: [
            // 1. Base raster map
            {
              id: "base-tiles-layer",
              type: "raster",
              source: "base-tiles",
              minzoom: 0,
              maxzoom: 20,
            },

            // 2. OpenInfra Vector Tiles Overlay (Optional, toggled by user)
            {
              id: "openinfra-line-casing",
              type: "line",
              source: "openinframap",
              "source-layer": "power_line",
              layout: {
                visibility: "none",
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "#FFFFFF",
                "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2, 10, 4.5, 14, 7],
                "line-opacity": 0.6,
              },
            },
            {
              id: "openinfra-line-core",
              type: "line",
              source: "openinframap",
              "source-layer": "power_line",
              layout: {
                visibility: "none",
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": [
                  "case",
                  [">=", ["to-number", ["get", "voltage"], 0], 700000], "#9333EA",
                  [">=", ["to-number", ["get", "voltage"], 0], 380000], "#EF4444",
                  [">=", ["to-number", ["get", "voltage"], 0], 200000], "#F97316",
                  [">=", ["to-number", ["get", "voltage"], 0], 100000], "#0284C7",
                  "#10B981",
                ],
                "line-width": 2,
                "line-opacity": 0.85,
              },
            },

            // 3. West Bengal Power Transmission Lines - Halo / Casing (OpenInfra style)
            {
              id: "wb-line-casing",
              type: "line",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_line"],
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": activeBaseMap === "satellite" ? "#0F172A" : "#FFFFFF",
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  [
                    "case",
                    [">=", ["get", "voltage_class"], 765], 8.5,
                    [">=", ["get", "voltage_class"], 400], 7.0,
                    [">=", ["get", "voltage_class"], 220], 5.5,
                    3.8,
                  ],
                  7,
                  [
                    "case",
                    [">=", ["get", "voltage_class"], 765], 11.0,
                    [">=", ["get", "voltage_class"], 400], 9.0,
                    [">=", ["get", "voltage_class"], 220], 7.0,
                    4.8,
                  ],
                  10,
                  [
                    "case",
                    [">=", ["get", "voltage_class"], 765], 13.5,
                    [">=", ["get", "voltage_class"], 400], 11.0,
                    [">=", ["get", "voltage_class"], 220], 8.5,
                    6.0,
                  ],
                  14,
                  [
                    "case",
                    [">=", ["get", "voltage_class"], 765], 16.0,
                    [">=", ["get", "voltage_class"], 400], 13.5,
                    [">=", ["get", "voltage_class"], 220], 10.5,
                    7.5,
                  ],
                ],
                "line-opacity": 0.92,
              },
            },

            // 4. West Bengal Power Transmission Lines - Bold Core (OpenInfra style)
            {
              id: "wb-line-core",
              type: "line",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_line"],
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": ["get", "color"],
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  [
                    "case",
                    [">=", ["get", "voltage_class"], 765], 6.0,
                    [">=", ["get", "voltage_class"], 400], 4.8,
                    [">=", ["get", "voltage_class"], 220], 3.5,
                    2.4,
                  ],
                  7,
                  [
                    "case",
                    [">=", ["get", "voltage_class"], 765], 8.0,
                    [">=", ["get", "voltage_class"], 400], 6.5,
                    [">=", ["get", "voltage_class"], 220], 4.8,
                    3.2,
                  ],
                  10,
                  [
                    "case",
                    [">=", ["get", "voltage_class"], 765], 10.5,
                    [">=", ["get", "voltage_class"], 400], 8.5,
                    [">=", ["get", "voltage_class"], 220], 6.2,
                    4.2,
                  ],
                  14,
                  [
                    "case",
                    [">=", ["get", "voltage_class"], 765], 13.0,
                    [">=", ["get", "voltage_class"], 400], 10.5,
                    [">=", ["get", "voltage_class"], 220], 8.0,
                    5.5,
                  ],
                ],
                "line-opacity": 1.0,
              },
            },

            // 5. Line Labels
            {
              id: "wb-line-label",
              type: "symbol",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_line"],
              minzoom: 8.8,
              layout: {
                "symbol-placement": "line",
                "text-field": ["get", "name"],
                "text-size": 10.5,
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "text-letter-spacing": 0.04,
              },
              paint: {
                "text-color": "#0F172A",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 2.5,
              },
            },

            // 6. Substation Circles
            {
              id: "wb-substation-circle",
              type: "circle",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_substation"],
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 5.5,
                  7, 8.5,
                  10, 11.5,
                  14, 15.0,
                ],
                "circle-color": ["get", "color"],
                "circle-stroke-width": 2.5,
                "circle-stroke-color": "#FFFFFF",
              },
            },

            // 7. Power Plant Outer Glowing Beacon (Visible Like OpenInfra)
            {
              id: "wb-plant-beacon",
              type: "circle",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_plant"],
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6, 9.0,
                  10, 15.0,
                  14, 22.0,
                ],
                "circle-color": ["get", "color"],
                "circle-opacity": 0.35,
                "circle-stroke-width": 2,
                "circle-stroke-color": ["get", "color"],
              },
            },

            // 8. Power Plant Core Circle
            {
              id: "wb-plant-core",
              type: "circle",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_plant"],
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6, 6.0,
                  10, 9.5,
                  14, 13.5,
                ],
                "circle-color": ["get", "color"],
                "circle-stroke-width": 2.5,
                "circle-stroke-color": "#FFFFFF",
              },
            },

            // 9. Power Plant Labels (Always visible with MW capacity)
            {
              id: "wb-plant-label",
              type: "symbol",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_plant"],
              minzoom: 7.2,
              layout: {
                "text-field": [
                  "concat",
                  ["get", "short_name"],
                  "\n(",
                  ["get", "capacity_label"],
                  ")",
                ],
                "text-size": 11,
                "text-offset": [0, 1.6],
                "text-anchor": "top",
                "text-justify": "center",
              },
              paint: {
                "text-color": "#991B1B",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 2.8,
              },
            },
          ],
        },
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 5.5,
        maxZoom: 18,
        maxBounds: [
          [81.5, 19.0],
          [93.0, 29.5],
        ],
      });

      map.addControl(new NavigationControl({ showCompass: true }), "top-right");

      map.on("load", () => {
        setMapLoaded(true);

        // Click on Power Transmission Lines
        map.on("click", "wb-line-core", (e) => {
          if (!e.features || e.features.length === 0) return;
          const feat = e.features[0];
          const props = feat.properties || {};

          new Popup({ offset: 12, className: "power-popup" })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family: inherit; font-size: 13px; line-height: 1.45; padding: 4px; min-width: 220px;">
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: #0F172A; margin-bottom: 6px;">
                  <span style="display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: ${props.color || '#EF4444'};"></span>
                  <span>⚡ ${props.name}</span>
                </div>
                <div style="font-size: 11.5px; color: #475569; display: flex; flex-direction: column; gap: 3px;">
                  <div><b>Operating Voltage:</b> <span style="color:#DC2626; font-weight:800; font-size:12.5px;">${props.voltage_label || props.voltage_class + ' kV'}</span></div>
                  <div><b>Circuits:</b> ${props.circuits === 2 ? 'Double Circuit (D/C)' : 'Single Circuit (S/C)'}</div>
                  <div><b>Utility / Operator:</b> ${props.operator || 'WBSETCL'}</div>
                  <div><b>Type:</b> ${props.line_type || 'Overhead Corridor'}</div>
                </div>
              </div>
            `)
            .addTo(map);
        });

        // Click on Power Plants (Generating Stations)
        map.on("click", "wb-plant-core", (e) => {
          if (!e.features || e.features.length === 0) return;
          const feat = e.features[0];
          const props = feat.properties || {};

          setSelectedEntity({
            type: "plant",
            ...props,
            coords: feat.geometry.coordinates,
          });

          new Popup({ offset: 14, className: "power-popup" })
            .setLngLat(feat.geometry.coordinates)
            .setHTML(`
              <div style="font-family: inherit; font-size: 13px; line-height: 1.45; padding: 4px; min-width: 240px;">
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: #991B1B; margin-bottom: 6px;">
                  <span style="font-size: 16px;">${props.fuel === 'coal' ? '🔥' : '💧'}</span>
                  <span>${props.name}</span>
                </div>
                <div style="font-size: 11.5px; color: #334155; display: flex; flex-direction: column; gap: 3px;">
                  <div><b>Installed Capacity:</b> <span style="background: #FEF3C7; color: #B45309; padding: 2px 6px; border-radius: 4px; font-weight: 800;">${props.capacity_label || props.capacity_mw + ' MW'}</span></div>
                  <div><b>Fuel Source:</b> ${props.fuel === 'coal' ? 'Thermal (Coal)' : 'Hydroelectric'}</div>
                  ${props.units ? `<div><b>Units:</b> ${props.units}</div>` : ''}
                  <div><b>Switchyard Voltage:</b> <span style="color: #DC2626; font-weight: 700;">${props.voltage || '400 kV'}</span></div>
                  <div><b>Operating Utility:</b> <b>${props.operator || 'WBPDCL'}</b></div>
                  <div><b>District:</b> ${props.district || 'West Bengal'}</div>
                </div>
              </div>
            `)
            .addTo(map);
        });

        // Click on Substations
        map.on("click", "wb-substation-circle", (e) => {
          if (!e.features || e.features.length === 0) return;
          const feat = e.features[0];
          const props = feat.properties || {};

          setSelectedEntity({
            type: "substation",
            ...props,
            coords: feat.geometry.coordinates,
          });
        });

        // Pointer cursor hover
        const clickable = ["wb-line-core", "wb-plant-core", "wb-plant-beacon", "wb-substation-circle"];
        clickable.forEach((l) => {
          map.on("mouseenter", l, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", l, () => {
            map.getCanvas().style.cursor = "";
          });
        });
      });

      map.on("error", (e) => {
        console.warn("MapLibre GL warning:", e);
      });

      mapRef.current = map;
    } catch (err) {
      console.error("Failed to initialize MapLibre GL map:", err);
      setMapError(err.message);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update base map layer when changed or when API key changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const baseConfig = BASEMAP_PROVIDERS.find((b) => b.id === activeBaseMap);
    if (!baseConfig) return;

    const tiles = baseConfig.getTiles ? baseConfig.getTiles(cartoApiKey) : baseConfig.tiles;

    if (map.getSource("base-tiles")) {
      const source = map.getSource("base-tiles");
      if (source.setTiles) {
        source.setTiles(tiles);
      }
    }

    // Update casing color according to basemap contrast
    if (map.getLayer("wb-line-casing")) {
      map.setPaintProperty(
        "wb-line-casing",
        "line-color",
        activeBaseMap === "satellite" ? "#0F172A" : "#FFFFFF"
      );
    }
  }, [activeBaseMap, cartoApiKey, mapLoaded]);

  // Update layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const setVis = (layerId, visible) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      }
    };

    setVis("wb-line-casing", layersVisibility.powerLines);
    setVis("wb-line-core", layersVisibility.powerLines);
    setVis("wb-line-label", layersVisibility.powerLines && layersVisibility.labels);
    setVis("wb-plant-beacon", layersVisibility.powerPlants);
    setVis("wb-plant-core", layersVisibility.powerPlants);
    setVis("wb-plant-label", layersVisibility.powerPlants && layersVisibility.labels);
    setVis("wb-substation-circle", layersVisibility.substations);
    setVis("openinfra-line-casing", layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-line-core", layersVisibility.liveOpenInfraTiles);
  }, [layersVisibility, mapLoaded]);

  // Render HTML Markers for Substations & Plants
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!layersVisibility.labels) return;

    // Render badges for Substations
    if (layersVisibility.substations) {
      allSubstations.forEach((sub) => {
        const el = document.createElement("div");
        el.className = "wb-substation-badge";
        el.style.cssText = `
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-50%, -100%);
          pointer-events: auto;
        `;

        const badgeColor =
          sub.voltage_class >= 765
            ? "#9333EA"
            : sub.voltage_class >= 400
            ? "#DC2626"
            : sub.voltage_class >= 220
            ? "#EA580C"
            : "#0284C7";

        el.innerHTML = `
          <div style="
            background: ${badgeColor};
            color: #FFFFFF;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 999px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            white-space: nowrap;
            border: 1.5px solid #FFFFFF;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span>⚡ ${sub.short_name || sub.name}</span>
            <span style="background: rgba(0,0,0,0.25); padding: 1px 4px; border-radius: 4px; font-size: 8.5px;">${sub.voltage_class}kV</span>
          </div>
          <div style="
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 5px solid ${badgeColor};
            margin-top: -1px;
          "></div>
        `;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          flyToEntity("substation", sub);
        });

        const marker = new Marker({ element: el })
          .setLngLat(sub.coords)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }
  }, [mapLoaded, layersVisibility.labels, layersVisibility.substations, allSubstations]);

  // Fly to Entity (Substation, Power Plant, or Line)
  const flyToEntity = (type, entity) => {
    setSelectedEntity({ type, ...entity });
    const map = mapRef.current;
    if (!map) return;

    if (type === "line") {
      const mid = entity.coords?.[1] || entity.coords?.[0];
      if (mid) {
        map.flyTo({
          center: mid,
          zoom: 10.5,
          speed: 1.2,
        });
      }
    } else if (entity.coords) {
      map.flyTo({
        center: entity.coords,
        zoom: type === "plant" ? 12.0 : 12.5,
        speed: 1.3,
      });
    }
  };

  // Reset to West Bengal whole view
  const resetToWestBengal = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [87.641, 23.2],
      zoom: 7.6,
      speed: 1.2,
    });
    setSelectedEntity(null);
  };

  // Live Sync from OpenStreetMap / OpenInfra
  const handleSyncLive = async () => {
    setSyncLoading(true);
    setSyncFeedback(null);
    try {
      const res = await API.syncPowerGridLive();
      if (res.success) {
        setSyncFeedback({
          type: "success",
          message: res.message || "Grid dataset updated successfully from live OpenStreetMap!",
        });
        const freshData = await API.getPowerGridData();
        setGridData(freshData);
        const status = await API.getPowerGridStatus();
        setDatasetStatus(status);
      } else {
        setSyncFeedback({
          type: res.intranet_detected ? "warning" : "error",
          message: res.message || "Sync was unable to complete.",
        });
      }
    } catch (err) {
      setSyncFeedback({
        type: "warning",
        message:
          "Live server query timed out or network is restricted. The verified local West Bengal grid dataset remains active. You can also import updated GeoJSON files anytime.",
      });
    } finally {
      setSyncLoading(false);
    }
  };

  // Reset to Default Master Data
  const handleResetMaster = async () => {
    if (!window.confirm("Reset the power grid dataset to the verified West Bengal master dataset?")) return;
    setSyncLoading(true);
    try {
      await API.resetPowerGridData();
      const freshData = await API.getPowerGridData();
      setGridData(freshData);
      const status = await API.getPowerGridStatus();
      setDatasetStatus(status);
      setSyncFeedback({
        type: "success",
        message: "Reset to verified West Bengal master grid dataset complete.",
      });
    } catch (err) {
      setSyncFeedback({ type: "error", message: `Reset failed: ${err.message}` });
    } finally {
      setSyncLoading(false);
    }
  };

  // Import GeoJSON file
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingFile(true);
    setSyncFeedback(null);
    try {
      const res = await API.importPowerGridFile(file);
      setSyncFeedback({
        type: "success",
        message: res.message || `Successfully loaded ${file.name}!`,
      });
      const freshData = await API.getPowerGridData();
      setGridData(freshData);
      const status = await API.getPowerGridStatus();
      setDatasetStatus(status);
    } catch (err) {
      setSyncFeedback({
        type: "error",
        message: err.response?.data?.detail || err.message || "File import failed.",
      });
    } finally {
      setImportingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Apply JSON text import
  const handleApplyJsonText = async () => {
    if (!importText.trim()) return;
    setImportingFile(true);
    setSyncFeedback(null);
    try {
      const parsed = JSON.parse(importText);
      const res = await API.importPowerGridData(parsed);
      setSyncFeedback({
        type: "success",
        message: res.message || "GeoJSON dataset updated successfully!",
      });
      setGridData(parsed);
      const status = await API.getPowerGridStatus();
      setDatasetStatus(status);
      setImportText("");
    } catch (err) {
      setSyncFeedback({
        type: "error",
        message: err.message || "Invalid JSON or import error.",
      });
    } finally {
      setImportingFile(false);
    }
  };

  return (
    <div className="d-flex flex-column" style={{ minHeight: "100vh", backgroundColor: "#F8FAFC" }}>
      <TopNavbar />

      <main className="container-fluid px-3 py-2 flex-grow-1 d-flex flex-column">
        {/* Page Header with Live Sync & Reference Links */}
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2 p-3 bg-white rounded-3 border shadow-sm">
          <div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="badge rounded-pill bg-success-subtle text-success px-2 py-1 fw-bold">
                Analytics Module
              </span>
              <span className="badge rounded-pill bg-primary-subtle text-primary px-2 py-1 fw-bold">
                Eastern Region (WB, OD, BR, JH, SK)
              </span>
              <span className="badge rounded-pill bg-danger-subtle text-danger px-2 py-1 fw-bold">
                OpenInfra High-Visibility
              </span>
            </div>
            <h4 className="fw-bold text-dark mt-1 mb-0 d-flex align-items-center gap-2">
              <Compass size={22} className="text-primary" />
              Eastern Region Power System Grid Map
            </h4>
            <div className="text-muted small mt-1">
              Visualizing <b>{allLines.length} Transmission Corridors</b>, <b>{allPlants.length} Generating Stations ({totalCapacityMW.toLocaleString()} MW)</b>, and <b>{allSubstations.length} Grid Substations</b> across West Bengal, Odisha, Bihar, Jharkhand & Sikkim.
            </div>

            {/* Quick State Zoom Pills */}
            <div className="d-flex align-items-center gap-1 mt-2 flex-wrap">
              <span className="text-secondary small fw-bold me-1">Focus State:</span>
              {[
                { id: "all", label: "All Eastern Region" },
                { id: "West Bengal", label: "West Bengal" },
                { id: "Bihar", label: "Bihar" },
                { id: "Jharkhand", label: "Jharkhand" },
                { id: "Odisha", label: "Odisha" },
                { id: "Sikkim", label: "Sikkim" },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => handleStateZoom(st.id)}
                  className={`btn btn-xs py-0.5 px-2 rounded-pill fw-bold ${
                    activeState === st.id ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  style={{ fontSize: "11px" }}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action & Data Sync Controls */}
          <div className="d-flex flex-wrap align-items-center gap-2">
            {/* CRMS Master Data Mapping Popup Button */}
            <button
              onClick={handleOpenCrmsModal}
              className="btn btn-sm d-flex align-items-center gap-1.5 fw-bold shadow-sm text-white"
              style={{ backgroundColor: "#4F46E5", borderColor: "#4338CA" }}
              title="Map Transmission Lines & Substations with CRMS Codebook Master Data"
            >
              <Database size={14} />
              <span>CRMS Master Mapping</span>
              <span className="badge bg-white text-dark rounded-pill ms-1" style={{ fontSize: "10px" }}>
                {Object.keys(crmsMappings).length} Mapped
              </span>
            </button>

            {/* Live Sync / Update Data Button */}
            <button
              onClick={() => setSyncModalOpen(true)}
              className="btn btn-primary btn-sm d-flex align-items-center gap-1.5 fw-bold shadow-sm"
              title="Manage live sync, update, or import grid dataset"
            >
              <RefreshCw size={14} className={syncLoading ? "spinner-border spinner-border-sm" : ""} />
              <span>Grid Data & Sync</span>
              <span className="badge bg-white text-primary rounded-pill ms-1" style={{ fontSize: "10px" }}>
                {allLines.length + allPlants.length + allSubstations.length}
              </span>
            </button>

            {/* Quick Link to OpenInfra */}
            <a
              href="https://openinframap.org/#7.64/22.21/87.641"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1 fw-semibold"
              title="Open Infrastructure Map reference"
            >
              <ExternalLink size={14} />
              OpenInfraMap
            </a>

            {/* Basemap Settings */}
            <button
              onClick={() => {
                setTempKeyInput(cartoApiKey);
                setKeyModalOpen(true);
              }}
              className={`btn btn-sm d-flex align-items-center gap-1 ${
                cartoApiKey ? "btn-outline-success" : "btn-outline-secondary"
              }`}
              title="Basemap Styles & API Key Settings"
            >
              <Key size={14} />
              <span>{cartoApiKey ? "CARTO Active" : "Basemap"}</span>
            </button>

            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="btn btn-light border btn-sm d-flex align-items-center gap-1"
              title="Toggle Full Screen"
            >
              {isFullScreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

        {/* Main Work Area: Left Sidebar + Map View */}
        <div
          className="row g-2 flex-grow-1"
          style={{
            minHeight: isFullScreen ? "calc(100vh - 80px)" : "720px",
            height: isFullScreen ? "calc(100vh - 80px)" : "750px",
          }}
        >
          {/* Substation, Power Plant & Transmission Directory Panel */}
          {sidebarOpen && (
            <div className="col-12 col-lg-4 col-xl-3 d-flex flex-column" style={{ height: "100%" }}>
              <div className="card h-100 border-0 shadow-sm rounded-3 d-flex flex-column">
                <div className="card-header bg-white border-bottom p-3">
                  {/* Category Tabs: Substations, Power Plants, Transmission Lines */}
                  <div className="btn-group w-100 btn-group-sm mb-2" role="group">
                    <button
                      type="button"
                      className={`btn ${activeTab === "all" ? "btn-dark fw-bold" : "btn-outline-secondary"}`}
                      onClick={() => setActiveTab("all")}
                    >
                      All ({allPlants.length + allSubstations.length + allLines.length})
                    </button>
                    <button
                      type="button"
                      className={`btn ${activeTab === "plants" ? "btn-danger fw-bold" : "btn-outline-danger"}`}
                      onClick={() => setActiveTab("plants")}
                    >
                      Plants ({allPlants.length})
                    </button>
                    <button
                      type="button"
                      className={`btn ${activeTab === "substations" ? "btn-primary fw-bold" : "btn-outline-primary"}`}
                      onClick={() => setActiveTab("substations")}
                    >
                      Subs ({allSubstations.length})
                    </button>
                    <button
                      type="button"
                      className={`btn ${activeTab === "lines" ? "btn-warning text-dark fw-bold" : "btn-outline-warning text-dark"}`}
                      onClick={() => setActiveTab("lines")}
                    >
                      Lines ({allLines.length})
                    </button>
                  </div>

                  {/* Search Bar */}
                  <div className="input-group input-group-sm mb-2">
                    <span className="input-group-text bg-light border-end-0">
                      <Search size={14} className="text-muted" />
                    </span>
                    <input
                      type="text"
                      className="form-control bg-light border-start-0"
                      placeholder="Search name, district, utility, fuel..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setSearchQuery("")}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {["all", "765", "400", "220", "132"].map((vf) => (
                      <button
                        key={vf}
                        className={`btn btn-xs px-2 py-0 rounded-pill ${
                          voltageFilter === vf
                            ? "btn-dark fw-bold"
                            : "btn-outline-secondary"
                        }`}
                        style={{ fontSize: "11px" }}
                        onClick={() => setVoltageFilter(vf)}
                      >
                        {vf === "all" ? "All kV" : `${vf} kV`}
                      </button>
                    ))}
                  </div>

                  {/* Operator Filter */}
                  <div className="d-flex align-items-center gap-1 overflow-auto pb-1">
                    <span className="text-muted" style={{ fontSize: "11px" }}>
                      Utility:
                    </span>
                    {["all", "WBSETCL", "POWERGRID", "WBPDCL", "DVC", "CESC"].map((op) => (
                      <button
                        key={op}
                        className={`btn btn-xs px-1 py-0 ${
                          operatorFilter === op ? "text-primary fw-bold text-decoration-underline" : "text-muted"
                        }`}
                        style={{ fontSize: "11px" }}
                        onClick={() => setOperatorFilter(op)}
                      >
                        {op === "all" ? "All" : op}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Directory Content List */}
                <div className="card-body p-2 flex-grow-1 overflow-auto">
                  {/* Power Plants Section */}
                  {(activeTab === "all" || activeTab === "plants") && filteredPlants.length > 0 && (
                    <div className="mb-3">
                      <div className="d-flex align-items-center justify-content-between px-1 mb-1 text-danger fw-bold small">
                        <span className="d-flex align-items-center gap-1">
                          <Flame size={14} /> Power Generating Stations
                        </span>
                        <span className="badge bg-danger-subtle text-danger rounded-pill">
                          {filteredPlants.length}
                        </span>
                      </div>
                      <div className="d-flex flex-column gap-1">
                        {filteredPlants.map((plant) => {
                          const isSelected = selectedEntity?.id === plant.id;
                          return (
                            <div
                              key={plant.id}
                              onClick={() => flyToEntity("plant", plant)}
                              className={`p-2 rounded-2 border transition-all ${
                                isSelected
                                  ? "bg-danger-subtle border-danger shadow-sm"
                                  : "bg-white hover-bg-light cursor-pointer"
                              }`}
                              style={{ cursor: "pointer" }}
                            >
                              <div className="d-flex align-items-center justify-content-between">
                                <span className="fw-bold text-dark small d-flex align-items-center gap-1.5">
                                  <span>{plant.fuel === "coal" ? "🔥" : "💧"}</span>
                                  <span>{plant.short_name || plant.name}</span>
                                </span>
                                <span className="badge bg-amber-subtle text-amber-900 border fw-bold" style={{ fontSize: "10px", backgroundColor: "#FEF3C7", color: "#92400E" }}>
                                  {plant.capacity_label || `${plant.capacity_mw} MW`}
                                </span>
                              </div>
                              <div className="d-flex align-items-center justify-content-between text-muted mt-1" style={{ fontSize: "11px" }}>
                                <span>{plant.operator} · {plant.district}</span>
                                <span className="text-danger fw-semibold">{plant.voltage || '400 kV'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Substations Section */}
                  {(activeTab === "all" || activeTab === "substations") && filteredSubstations.length > 0 && (
                    <div className="mb-3">
                      <div className="d-flex align-items-center justify-content-between px-1 mb-1 text-primary fw-bold small">
                        <span className="d-flex align-items-center gap-1">
                          <Zap size={14} /> Grid Substations
                        </span>
                        <span className="badge bg-primary-subtle text-primary rounded-pill">
                          {filteredSubstations.length}
                        </span>
                      </div>
                      <div className="d-flex flex-column gap-1">
                        {filteredSubstations.map((sub) => {
                          const isSelected = selectedEntity?.id === sub.id;
                          const vColor =
                            sub.voltage_class >= 765
                              ? "#9333EA"
                              : sub.voltage_class >= 400
                              ? "#DC2626"
                              : sub.voltage_class >= 220
                              ? "#EA580C"
                              : "#0284C7";

                          return (
                            <div
                              key={sub.id}
                              onClick={() => flyToEntity("substation", sub)}
                              className={`p-2 rounded-2 border transition-all ${
                                isSelected
                                  ? "bg-primary-subtle border-primary shadow-sm"
                                  : "bg-white hover-bg-light cursor-pointer"
                              }`}
                              style={{ cursor: "pointer" }}
                            >
                              <div className="d-flex align-items-center justify-content-between">
                                <span className="fw-bold text-dark small d-flex align-items-center gap-1.5">
                                  <span
                                    style={{
                                      width: "8px",
                                      height: "8px",
                                      borderRadius: "50%",
                                      backgroundColor: vColor,
                                      display: "inline-block",
                                    }}
                                  ></span>
                                  <span>{sub.short_name || sub.name}</span>
                                </span>
                                <span
                                  className="badge rounded-pill"
                                  style={{
                                    backgroundColor: `${vColor}15`,
                                    color: vColor,
                                    border: `1px solid ${vColor}40`,
                                    fontSize: "10px",
                                  }}
                                >
                                  {sub.voltage || `${sub.voltage_class} kV`}
                                </span>
                              </div>
                              <div className="d-flex align-items-center justify-content-between text-muted mt-1" style={{ fontSize: "11px" }}>
                                <span>{sub.operator}</span>
                                <span>{sub.district}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Transmission Corridors Section */}
                  {(activeTab === "all" || activeTab === "lines") && filteredLines.length > 0 && (
                    <div className="mb-2">
                      <div className="d-flex align-items-center justify-content-between px-1 mb-1 text-dark fw-bold small">
                        <span className="d-flex align-items-center gap-1">
                          <Activity size={14} className="text-warning" /> Transmission Corridors
                        </span>
                        <span className="badge bg-secondary-subtle text-secondary rounded-pill">
                          {filteredLines.length}
                        </span>
                      </div>
                      <div className="d-flex flex-column gap-1">
                        {filteredLines.map((line) => {
                          const isSelected = selectedEntity?.id === line.id;
                          return (
                            <div
                              key={line.id}
                              onClick={() => flyToEntity("line", line)}
                              className={`p-2 rounded-2 border transition-all ${
                                isSelected
                                  ? "bg-warning-subtle border-warning shadow-sm"
                                  : "bg-white hover-bg-light cursor-pointer"
                              }`}
                              style={{ cursor: "pointer" }}
                            >
                              <div className="d-flex align-items-center justify-content-between">
                                <span className="fw-bold text-dark small d-flex align-items-center gap-1.5">
                                  <span
                                    style={{
                                      width: "12px",
                                      height: "4px",
                                      borderRadius: "2px",
                                      backgroundColor: line.color,
                                      display: "inline-block",
                                    }}
                                  ></span>
                                  <span>{line.name}</span>
                                </span>
                              </div>
                              <div className="d-flex align-items-center justify-content-between text-muted mt-1" style={{ fontSize: "11px" }}>
                                <span>{line.operator} · {line.circuits === 2 ? "D/C" : "S/C"}</span>
                                <span className="fw-bold" style={{ color: line.color }}>{line.voltage_label}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Empty search */}
                  {filteredPlants.length === 0 && filteredSubstations.length === 0 && filteredLines.length === 0 && (
                    <div className="text-center py-5 text-muted small">
                      <Search size={24} className="opacity-50 mb-2" />
                      <div>No grid infrastructure matching your search.</div>
                    </div>
                  )}
                </div>

                {/* Footer Reset View */}
                <div className="card-footer bg-light border-top p-2 text-center">
                  <button
                    onClick={resetToWestBengal}
                    className="btn btn-outline-secondary btn-sm w-100 d-flex align-items-center justify-content-center gap-1 fw-semibold"
                  >
                    <RotateCcw size={13} />
                    <span>Reset to West Bengal Overview</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive MapLibre GL Map View */}
          <div
            className={`${
              sidebarOpen ? "col-12 col-lg-8 col-xl-9" : "col-12"
            } d-flex flex-column position-relative`}
            style={{ height: "100%" }}
          >
            <div
              ref={mapContainerRef}
              className="w-100 h-100 rounded-3 border shadow-sm position-relative overflow-hidden"
              style={{ backgroundColor: "#E2E8F0" }}
            />

            {/* Toggle Sidebar Button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="btn btn-light btn-sm position-absolute top-0 start-0 m-2 shadow-sm border d-flex align-items-center gap-1 z-3"
              style={{ fontSize: "11px", fontWeight: "700" }}
            >
              <Layers size={13} />
              {sidebarOpen ? "Hide Directory" : "Show Directory"}
            </button>

            {/* Map Controls Overlay (Base Map & Grid Layer Toggles) */}
            <div
              className="position-absolute top-0 start-0 m-2 ms-5 ps-3 d-flex flex-column gap-2 z-2"
              style={{ maxWidth: "320px", marginTop: "42px" }}
            >
              <div className="card border-0 shadow-sm rounded-3 p-2 bg-white bg-opacity-95 backdrop-blur">
                {/* Basemap Switcher */}
                <div className="mb-2">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <span className="fw-bold text-muted" style={{ fontSize: "10px", letterSpacing: "0.5px" }}>
                      BASE MAP STYLE
                    </span>
                    <span className="badge bg-light text-dark border" style={{ fontSize: "9px" }}>
                      No Key
                    </span>
                  </div>
                  <div className="d-flex gap-1">
                    {BASEMAP_PROVIDERS.filter((b) => !b.requiresKey || cartoApiKey).map((prov) => (
                      <button
                        key={prov.id}
                        className={`btn btn-xs px-2 py-0.5 rounded-1 ${
                          activeBaseMap === prov.id
                            ? "btn-dark fw-bold text-white shadow-xs"
                            : "btn-outline-secondary"
                        }`}
                        style={{ fontSize: "11px" }}
                        onClick={() => setActiveBaseMap(prov.id)}
                        title={prov.label}
                      >
                        {prov.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid Infrastructure Layer Toggles */}
                <div>
                  <div className="fw-bold text-muted mb-1" style={{ fontSize: "10px", letterSpacing: "0.5px" }}>
                    GRID LAYERS
                  </div>
                  <div className="d-flex flex-column gap-1" style={{ fontSize: "11px" }}>
                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none">
                      <input
                        type="checkbox"
                        checked={layersVisibility.powerLines}
                        onChange={(e) =>
                          setLayersVisibility({ ...layersVisibility, powerLines: e.target.checked })
                        }
                      />
                      <span className="fw-bold text-danger">⚡ Transmission Corridors (WB)</span>
                    </label>

                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none">
                      <input
                        type="checkbox"
                        checked={layersVisibility.powerPlants}
                        onChange={(e) =>
                          setLayersVisibility({ ...layersVisibility, powerPlants: e.target.checked })
                        }
                      />
                      <span className="fw-bold text-dark">🔥 Power Generating Stations</span>
                    </label>

                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none">
                      <input
                        type="checkbox"
                        checked={layersVisibility.substations}
                        onChange={(e) =>
                          setLayersVisibility({ ...layersVisibility, substations: e.target.checked })
                        }
                      />
                      <span>Substations & Switchyards</span>
                    </label>

                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none">
                      <input
                        type="checkbox"
                        checked={layersVisibility.labels}
                        onChange={(e) =>
                          setLayersVisibility({ ...layersVisibility, labels: e.target.checked })
                        }
                      />
                      <span>Station Name Badges</span>
                    </label>

                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none mt-1 pt-1 border-top">
                      <input
                        type="checkbox"
                        checked={layersVisibility.liveOpenInfraTiles}
                        onChange={(e) =>
                          setLayersVisibility({
                            ...layersVisibility,
                            liveOpenInfraTiles: e.target.checked,
                          })
                        }
                      />
                      <span className="text-primary fw-semibold">🌐 Live OpenInfra Vector Tiles</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Entity Float Card */}
            {selectedEntity && (
              <div
                className="position-absolute bottom-0 start-0 m-3 card border-0 shadow-lg rounded-3 z-3 bg-white"
                style={{ maxWidth: "420px", borderLeft: `5px solid ${selectedEntity.color || "#EF4444"}` }}
              >
                <div className="card-body p-3">
                  <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                    <div>
                      <div className="d-flex align-items-center gap-1.5 mb-1">
                        <span
                          className="badge rounded-pill fw-bold"
                          style={{
                            backgroundColor: `${selectedEntity.color || "#EF4444"}20`,
                            color: selectedEntity.color || "#EF4444",
                            border: `1px solid ${selectedEntity.color || "#EF4444"}40`,
                            fontSize: "10px",
                          }}
                        >
                          {selectedEntity.type === "plant"
                            ? "Power Plant"
                            : selectedEntity.type === "line"
                            ? "Corridor"
                            : "Substation"}
                        </span>
                        <span className="badge bg-light text-dark border" style={{ fontSize: "10px" }}>
                          {selectedEntity.voltage || selectedEntity.voltage_label || `${selectedEntity.voltage_class} kV`}
                        </span>
                        <span className="badge bg-light text-secondary border" style={{ fontSize: "10px" }}>
                          {selectedEntity.operator || "WBSETCL"}
                        </span>
                      </div>
                      <h6 className="fw-bold text-dark mb-0">{selectedEntity.name}</h6>
                    </div>
                    <button
                      onClick={() => setSelectedEntity(null)}
                      className="btn btn-sm btn-light border-0 p-1 text-muted"
                      title="Close"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="text-muted small mb-2" style={{ fontSize: "12px", lineHeight: "1.4" }}>
                    {selectedEntity.type === "plant" && (
                      <div>
                        <div><b>Capacity:</b> <span className="fw-bold text-danger">{selectedEntity.capacity_label || `${selectedEntity.capacity_mw} MW`}</span></div>
                        {selectedEntity.units && <div><b>Units:</b> {selectedEntity.units}</div>}
                        <div><b>Fuel:</b> {selectedEntity.fuel === "coal" ? "Thermal (Coal)" : "Hydroelectric"}</div>
                        <div><b>District:</b> {selectedEntity.district}</div>
                      </div>
                    )}
                    {selectedEntity.type === "line" && (
                      <div>
                        <div><b>Corridor:</b> {selectedEntity.from_name} ➔ {selectedEntity.to_name}</div>
                        <div><b>Circuits:</b> {selectedEntity.circuits === 2 ? "Double Circuit (D/C)" : "Single Circuit (S/C)"}</div>
                        <div><b>Operating Voltage:</b> {selectedEntity.voltage_label}</div>
                      </div>
                    )}
                    {selectedEntity.type === "substation" && (
                      <div>
                        <div><b>Voltage Level:</b> {selectedEntity.voltage}</div>
                        <div><b>District:</b> {selectedEntity.district}</div>
                        <div><b>Operator:</b> {selectedEntity.operator}</div>
                      </div>
                    )}
                  </div>

                                    {/* CRMS Codebook Mapping Info */}
                  <div className="mb-2 p-2 rounded" style={{ backgroundColor: "#EEF2FF", border: "1px solid #C7D2FE" }}>
                    <div className="d-flex align-items-center justify-content-between">
                      <span className="small fw-bold text-primary d-flex align-items-center gap-1">
                        <Database size={12} /> CRMS Codebook Master:
                      </span>
                      <button
                        onClick={handleOpenCrmsModal}
                        className="btn btn-link btn-xs p-0 text-decoration-none fw-bold"
                        style={{ fontSize: "10.5px" }}
                      >
                        {crmsMappings[selectedEntity.id] ? "Edit" : "Map Now"}
                      </button>
                    </div>
                    <div className="fw-bold mt-1 text-dark" style={{ fontSize: "11px" }}>
                      {crmsMappings[selectedEntity.id] || selectedEntity.crms_codebook ? (
                        <span className="fw-bold" style={{ color: "#4338CA" }}>
                          🔗 {crmsMappings[selectedEntity.id] || selectedEntity.crms_codebook}
                        </span>
                      ) : (
                        <span className="text-muted fst-italic">Not mapped yet with CRMS</span>
                      )}
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-1.5 pt-2 border-top">
                    {selectedEntity.coords && (
                      <a
                        href={`https://openinframap.org/#14/${selectedEntity.coords[1]}/${selectedEntity.coords[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline-primary btn-xs py-1 px-2 d-flex align-items-center gap-1"
                        style={{ fontSize: "11px" }}
                      >
                        <ExternalLink size={12} />
                        View in OpenInfraMap
                      </a>
                    )}
                    <button
                      onClick={() => flyToEntity(selectedEntity.type, selectedEntity)}
                      className="btn btn-primary btn-xs py-1 px-2 d-flex align-items-center gap-1 fw-bold"
                      style={{ fontSize: "11px" }}
                    >
                      <MapPin size={12} />
                      Zoom Focus
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Voltage Legend Overlay (OpenInfra Standard Colors) */}
            <div
              className="position-absolute bottom-0 end-0 m-3 card border-0 shadow-sm rounded-3 p-2 bg-white bg-opacity-95 backdrop-blur z-2"
              style={{ fontSize: "10.5px" }}
            >
              <div className="fw-bold text-dark mb-1 d-flex align-items-center justify-content-between gap-3">
                <span>Voltage Legend (kV)</span>
                <span className="badge bg-secondary-subtle text-secondary" style={{ fontSize: "8.5px" }}>
                  OpenInfra
                </span>
              </div>
              <div className="d-flex flex-column gap-1">
                <div className="d-flex align-items-center gap-1.5">
                  <span style={{ width: "16px", height: "4px", backgroundColor: "#9333EA", borderRadius: "2px" }}></span>
                  <span className="fw-bold">765 kV / ±800kV HVDC</span>
                </div>
                <div className="d-flex align-items-center gap-1.5">
                  <span style={{ width: "16px", height: "4px", backgroundColor: "#EF4444", borderRadius: "2px" }}></span>
                  <span className="fw-bold">400 kV</span>
                  <span className="text-muted">(Main Grid)</span>
                </div>
                <div className="d-flex align-items-center gap-1.5">
                  <span style={{ width: "16px", height: "4px", backgroundColor: "#F97316", borderRadius: "2px" }}></span>
                  <span className="fw-bold">220 kV</span>
                </div>
                <div className="d-flex align-items-center gap-1.5">
                  <span style={{ width: "16px", height: "4px", backgroundColor: "#0284C7", borderRadius: "2px" }}></span>
                  <span className="fw-bold">132 kV</span>
                  <span className="text-muted">(Sub-transmission)</span>
                </div>
                <div className="d-flex align-items-center gap-1.5 pt-1 mt-1 border-top">
                  <span style={{ width: "10px", height: "10px", backgroundColor: "#DC2626", borderRadius: "50%", border: "2px solid #FFF", display: "inline-block" }}></span>
                  <span className="fw-bold">🔥 Thermal Power Station</span>
                </div>
                <div className="d-flex align-items-center gap-1.5">
                  <span style={{ width: "10px", height: "10px", backgroundColor: "#0284C7", borderRadius: "50%", border: "2px solid #FFF", display: "inline-block" }}></span>
                  <span className="fw-bold">💧 Hydroelectric / PPSP</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Grid Data Synchronization & Offline Update Modal */}
      {syncModalOpen && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow-lg border-0 rounded-4">
              <div className="modal-header bg-primary text-white border-bottom-0 rounded-top-4">
                <div className="d-flex align-items-center gap-2">
                  <Database size={20} />
                  <h5 className="modal-title fw-bold">Power Grid Map Data Synchronization</h5>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setSyncModalOpen(false)}
                />
              </div>

              <div className="modal-body p-4">
                {/* Feedback banner */}
                {syncFeedback && (
                  <div
                    className={`alert alert-${
                      syncFeedback.type === "success"
                        ? "success"
                        : syncFeedback.type === "warning"
                        ? "warning"
                        : "danger"
                    } d-flex align-items-start gap-2 mb-3`}
                  >
                    {syncFeedback.type === "success" ? (
                      <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
                    )}
                    <div style={{ fontSize: "13px" }}>{syncFeedback.message}</div>
                  </div>
                )}

                {/* Current Dataset Stats Banner */}
                <div className="p-3 bg-light rounded-3 border mb-3">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="fw-bold text-dark">Active West Bengal Power Grid Dataset</span>
                    <span className="badge bg-success-subtle text-success px-2 py-1 fw-bold">
                      {datasetStatus?.source || "Curated WB Master"}
                    </span>
                  </div>
                  <div className="row g-2 text-center">
                    <div className="col-4">
                      <div className="p-2 bg-white rounded-2 border">
                        <div className="fw-bold text-danger fs-5">{allLines.length}</div>
                        <div className="text-muted" style={{ fontSize: "11px" }}>Transmission Corridors</div>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="p-2 bg-white rounded-2 border">
                        <div className="fw-bold text-primary fs-5">{allPlants.length}</div>
                        <div className="text-muted" style={{ fontSize: "11px" }}>Power Plants ({totalCapacityMW.toLocaleString()} MW)</div>
                      </div>
                    </div>
                    <div className="col-4">
                      <div className="p-2 bg-white rounded-2 border">
                        <div className="fw-bold text-dark fs-5">{allSubstations.length}</div>
                        <div className="text-muted" style={{ fontSize: "11px" }}>Grid Substations</div>
                      </div>
                    </div>
                  </div>
                  <div className="text-muted mt-2" style={{ fontSize: "11px" }}>
                    Last Synced: <b>{datasetStatus?.last_updated || "Current Session"}</b> · Region: West Bengal
                  </div>
                </div>

                {/* Section 1: Live Sync from OpenStreetMap / OpenInfra */}
                <div className="card mb-3 border">
                  <div className="card-body p-3">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <div>
                        <h6 className="fw-bold mb-0 d-flex align-items-center gap-1.5">
                          <RefreshCw size={16} className="text-primary" />
                          Update from Live Site (OpenStreetMap / OpenInfra)
                        </h6>
                        <div className="text-muted small mt-1" style={{ fontSize: "12px" }}>
                          Queries live OpenStreetMap Overpass servers for the latest power lines, plants, and substations within West Bengal.
                        </div>
                      </div>
                      <button
                        onClick={handleSyncLive}
                        disabled={syncLoading}
                        className="btn btn-primary btn-sm d-flex align-items-center gap-1.5 fw-bold px-3 py-1.5 flex-shrink-0"
                      >
                        <RefreshCw size={14} className={syncLoading ? "spinner-border spinner-border-sm" : ""} />
                        <span>{syncLoading ? "Syncing..." : "Sync Live OSM Data"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 2: Offline Update via GeoJSON Upload */}
                <div className="card mb-3 border">
                  <div className="card-body p-3">
                    <h6 className="fw-bold mb-1 d-flex align-items-center gap-1.5">
                      <Upload size={16} className="text-success" />
                      Offline Import / Update (Air-gapped Intranet)
                    </h6>
                    <div className="text-muted small mb-2" style={{ fontSize: "12px" }}>
                      If the server has no internet access, download updated data from OpenInfraMap or Overpass Turbo on an external machine and upload it here:
                    </div>

                    <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".geojson,.json"
                        onChange={handleFileChange}
                        disabled={importingFile}
                        className="form-control form-control-sm"
                        style={{ maxWidth: "340px" }}
                      />
                      <span className="text-muted small">or paste JSON below</span>
                    </div>

                    <textarea
                      rows={2}
                      className="form-control form-control-sm font-monospace mb-2"
                      placeholder="Paste GeoJSON FeatureCollection JSON text here..."
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      style={{ fontSize: "11px" }}
                    />
                    {importText && (
                      <button
                        onClick={handleApplyJsonText}
                        disabled={importingFile}
                        className="btn btn-success btn-sm fw-bold"
                      >
                        Apply Pasted GeoJSON
                      </button>
                    )}
                  </div>
                </div>

                {/* Section 3: Export & Master Reset */}
                <div className="d-flex align-items-center justify-content-between pt-2 border-top">
                  <a
                    href={API.downloadPowerGridGeoJsonUrl()}
                    download="West_Bengal_Power_Grid.geojson"
                    className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 fw-semibold"
                  >
                    <Download size={14} />
                    Export Active GeoJSON
                  </a>

                  <button
                    onClick={handleResetMaster}
                    disabled={syncLoading}
                    className="btn btn-outline-danger btn-sm d-flex align-items-center gap-1 fw-semibold"
                  >
                    <RotateCcw size={14} />
                    Reset to Verified Master
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

            {/* CRMS Codebook Master Data Mapping Modal (Pop-up) */}
      {crmsModalOpen && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1060 }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content shadow-lg border-0 rounded-4">
              {/* Header */}
              <div
                className="modal-header text-white border-bottom-0 rounded-top-4 py-3 px-4"
                style={{ background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)" }}
              >
                <div>
                  <div className="d-flex align-items-center gap-2">
                    <Database size={20} className="text-warning" />
                    <h5 className="modal-title fw-bold text-white mb-0">
                      CRMS Master Data Mapping • AC Transmission Line Circuits & Substations
                    </h5>
                  </div>
                  <div className="small text-white-50 mt-1">
                    Source: <span className="font-monospace text-warning">https://crms.erldc.in/Codebook/getElementNamesbyType?elementType=AC_TRANSMISSION_LINE_CIRCUIT</span>
                  </div>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <span
                    className={`badge ${
                      crmsIsLive ? "bg-success" : "bg-warning text-dark"
                    } px-2.5 py-1 fw-bold`}
                  >
                    {crmsIsLive ? "● Live CRMS API Connected" : "● Master Cache Active (Offline)"}
                  </span>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    onClick={() => setCrmsModalOpen(false)}
                  />
                </div>
              </div>

              {/* Body */}
              <div className="modal-body p-4 bg-light">
                {/* Feedback Banner */}
                {crmsSaveFeedback && (
                  <div className={`alert alert-${crmsSaveFeedback.type} py-2 px-3 small mb-3 d-flex align-items-center justify-content-between`}>
                    <span>{crmsSaveFeedback.message}</span>
                    <button
                      type="button"
                      className="btn-close btn-sm"
                      onClick={() => setCrmsSaveFeedback(null)}
                    />
                  </div>
                )}

                {/* Top Action Toolbar */}
                <div className="card border-0 shadow-sm rounded-3 p-3 mb-3 bg-white">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      {/* Search box */}
                      <div className="input-group input-group-sm" style={{ width: "260px" }}>
                        <span className="input-group-text bg-light border-end-0">
                          <Search size={14} className="text-muted" />
                        </span>
                        <input
                          type="text"
                          className="form-control border-start-0"
                          placeholder="Search map element or CRMS..."
                          value={crmsSearch}
                          onChange={(e) => setCrmsSearch(e.target.value)}
                        />
                      </div>

                      {/* State Filter */}
                      <select
                        className="form-select form-select-sm"
                        style={{ width: "160px" }}
                        value={crmsStateFilter}
                        onChange={(e) => setCrmsStateFilter(e.target.value)}
                      >
                        <option value="all">All States (ER)</option>
                        <option value="West Bengal">West Bengal</option>
                        <option value="Bihar">Bihar</option>
                        <option value="Jharkhand">Jharkhand</option>
                        <option value="Odisha">Odisha</option>
                        <option value="Sikkim">Sikkim</option>
                      </select>

                      {/* Category Filter */}
                      <select
                        className="form-select form-select-sm"
                        style={{ width: "160px" }}
                        value={crmsCategoryFilter}
                        onChange={(e) => setCrmsCategoryFilter(e.target.value)}
                      >
                        <option value="all">All Categories</option>
                        <option value="power_line">Transmission Lines ({allLines.length})</option>
                        <option value="power_substation">Substations ({allSubstations.length})</option>
                      </select>
                    </div>

                    {/* Auto-Match & Refresh Buttons */}
                    <div className="d-flex align-items-center gap-2">
                      <button
                        onClick={handleAutoMatch}
                        disabled={crmsLoading}
                        className="btn btn-warning btn-sm fw-bold d-flex align-items-center gap-1 shadow-sm text-dark"
                        title="Auto-match elements based on voltage, corridor name, and station tokens"
                      >
                        <Zap size={14} />
                        Auto-Match Similar ({crmsElements.length} Circuits)
                      </button>

                      <button
                        onClick={handleSaveCrmsMappings}
                        disabled={crmsLoading || !crmsDirty}
                        className="btn btn-success btn-sm fw-bold d-flex align-items-center gap-1 shadow-sm"
                      >
                        <Check size={14} />
                        Save All Mappings
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table of Elements */}
                <div className="card border-0 shadow-sm rounded-3 overflow-hidden bg-white">
                  <div className="table-responsive" style={{ maxHeight: "420px" }}>
                    <table className="table table-hover table-sm align-middle mb-0" style={{ fontSize: "12px" }}>
                      <thead className="table-dark sticky-top" style={{ fontSize: "11px", letterSpacing: "0.5px" }}>
                        <tr>
                          <th style={{ width: "50px" }} className="text-center">#</th>
                          <th style={{ width: "90px" }}>Category</th>
                          <th style={{ width: "80px" }}>Voltage</th>
                          <th style={{ width: "120px" }}>State</th>
                          <th>Map Element Name</th>
                          <th style={{ minWidth: "320px" }}>CRMS Master Element (Codebook API)</th>
                          <th style={{ width: "110px" }} className="text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gridData.features
                          .filter((f) => {
                            const p = f.properties || {};
                            if (crmsCategoryFilter !== "all" && p.category !== crmsCategoryFilter) return false;
                            if (crmsStateFilter !== "all" && p.state !== crmsStateFilter) return false;
                            if (crmsSearch) {
                              const q = crmsSearch.toLowerCase();
                              const nameMatch = (p.name || "").toLowerCase().includes(q);
                              const crmsMatch = (crmsMappings[f.id || p.id] || "").toLowerCase().includes(q);
                              if (!nameMatch && !crmsMatch) return false;
                            }
                            return true;
                          })
                          .map((feat, idx) => {
                            const p = feat.properties || {};
                            const fId = feat.id || p.id;
                            const currentCrms = crmsMappings[fId] || p.crms_codebook || "";
                            const isMapped = Boolean(currentCrms);

                            return (
                              <tr key={fId || idx}>
                                <td className="text-center text-muted small">{idx + 1}</td>
                                <td>
                                  <span
                                    className={`badge rounded-pill ${
                                      p.category === "power_line"
                                        ? "bg-primary-subtle text-primary"
                                        : "bg-warning-subtle text-dark"
                                    } fw-semibold`}
                                    style={{ fontSize: "10px" }}
                                  >
                                    {p.category === "power_line" ? "Line" : "Substation"}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className="badge fw-bold"
                                    style={{ backgroundColor: p.color || "#0284C7", color: "#FFF", fontSize: "10px" }}
                                  >
                                    {p.voltage || `${p.voltage_class} kV`}
                                  </span>
                                </td>
                                <td className="text-secondary small fw-semibold">
                                  {p.state || "Eastern Region"}
                                </td>
                                <td>
                                  <div className="fw-bold text-dark">{p.name}</div>
                                  {p.operator && (
                                    <div className="text-muted" style={{ fontSize: "10.5px" }}>
                                      {p.operator}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <div className="d-flex align-items-center gap-1.5">
                                    <input
                                      type="text"
                                      list="crms-circuits-datalist"
                                      className="form-control form-control-sm font-monospace"
                                      placeholder="Select or enter CRMS Circuit name..."
                                      style={{
                                        fontSize: "11px",
                                        backgroundColor: currentCrms ? "#F0FDF4" : "#FFFFFF",
                                        borderColor: currentCrms ? "#86EFAC" : "#CBD5E1",
                                      }}
                                      value={currentCrms}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setCrmsMappings((prev) => ({
                                          ...prev,
                                          [fId]: val,
                                        }));
                                        setCrmsDirty(true);
                                      }}
                                    />
                                    {currentCrms && (
                                      <button
                                        type="button"
                                        className="btn btn-outline-danger btn-xs"
                                        title="Clear mapping"
                                        onClick={() => {
                                          setCrmsMappings((prev) => {
                                            const copy = { ...prev };
                                            delete copy[fId];
                                            return copy;
                                          });
                                          setCrmsDirty(true);
                                        }}
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="text-center">
                                  {isMapped ? (
                                    <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 fw-bold">
                                      Mapped
                                    </span>
                                  ) : (
                                    <span className="badge bg-secondary-subtle text-secondary px-2 py-1">
                                      Unmapped
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Datalist for fast autocomplete */}
                  <datalist id="crms-circuits-datalist">
                    {crmsElements.map((elem, i) => (
                      <option key={i} value={elem} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer bg-white border-top py-2.5 px-4 d-flex justify-content-between align-items-center">
                <div className="text-muted small">
                  Showing master elements for <b>AC Transmission Line Circuits</b> from ERLDC CRMS.
                </div>

                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setCrmsModalOpen(false)}
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm fw-bold d-flex align-items-center gap-1.5"
                    disabled={crmsLoading || !crmsDirty}
                    onClick={handleSaveCrmsMappings}
                  >
                    <Check size={15} />
                    Save & Update Map
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Basemap & CARTO Key Modal */}
      {keyModalOpen && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg border-0 rounded-4">
              <div className="modal-header bg-dark text-white border-bottom-0 rounded-top-4">
                <div className="d-flex align-items-center gap-2">
                  <Key size={18} className="text-warning" />
                  <h6 className="modal-title fw-bold">Basemap Styles & API Key Settings</h6>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setKeyModalOpen(false)}
                />
              </div>

              <div className="modal-body p-3">
                <div className="alert alert-info py-2 px-3 small mb-3">
                  <b>No key required:</b> OpenStreetMap Standard, Esri Light Gray Canvas, Esri Satellite, and Esri Topographic are completely free and pre-configured.
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold text-dark small mb-1">
                    CARTO API Key (Optional)
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Enter CARTO API key if using CARTO Voyager"
                    value={tempKeyInput}
                    onChange={(e) => setTempKeyInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer bg-light border-top-0 rounded-bottom-4 p-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setKeyModalOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm fw-bold"
                  onClick={() => {
                    if (tempKeyInput.trim()) {
                      localStorage.setItem("rtg_carto_api_key", tempKeyInput.trim());
                      setCartoApiKey(tempKeyInput.trim());
                      setActiveBaseMap("carto-voyager");
                    }
                    setKeyModalOpen(false);
                  }}
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
