import { useEffect, useRef, useState, useMemo } from "react";
import { Map, NavigationControl, Marker, Popup, setWorkerUrl } from "../vendor/maplibre-gl/maplibre-gl.mjs";
import maplibreWorkerUrl from "../vendor/maplibre-gl/maplibre-gl-worker.mjs?url";
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
  CloudSun,
  Thermometer,
} from "lucide-react";
import TopNavbar from "../components/layout/TopNavbar";
import API from "../services/api";
import defaultGridGeoJson from "../data/power_map/eastern_region_power_grid.json";
import easternRegionBoundaries from "../data/power_map/eastern_region_boundaries.json";
import NasaWeatherModal from "../components/weather/NasaWeatherModal";

// The vendored ESM build needs a separate, matching worker. Let Vite emit its
// asset URL explicitly; the library's relative default breaks after bundling.
setWorkerUrl(maplibreWorkerUrl);

// Safe coordinate extraction helper (supports Points [lon, lat] and LineStrings [[lon, lat], ...])
export function getEntityCoordinates(entity) {
  if (!entity || !entity.coords) return { lon: 85.8, lat: 23.5 };
  const c = entity.coords;
  if (Array.isArray(c)) {
    if (Array.isArray(c[0])) {
      const midIdx = Math.floor(c.length / 2);
      const pt = c[midIdx] || c[0];
      const lon = typeof pt[0] === "number" ? pt[0] : parseFloat(pt[0]) || 85.8;
      const lat = typeof pt[1] === "number" ? pt[1] : parseFloat(pt[1]) || 23.5;
      return { lon, lat };
    }
    const lon = typeof c[0] === "number" ? c[0] : parseFloat(c[0]) || 85.8;
    const lat = typeof c[1] === "number" ? c[1] : parseFloat(c[1]) || 23.5;
    return { lon, lat };
  }
  return { lon: 85.8, lat: 23.5 };
}

// Base map style options (Watermark-free, zero-API-key defaults)
export const BASEMAP_PROVIDERS = [
  {
    id: "osm",
    label: "OpenStreetMap Standard (Highways & Terrain)",
    shortLabel: "OSM",
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
    requiresKey: false,
    badge: "OSM Roads",
    bgColor: "#F1F5F9",
    tiles: [
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
    ],
    description: "Standard live OpenStreetMap with highways, towns, rivers, and civil boundaries as the secondary base map.",
  },
  {
    id: "carto-light",
    label: "OpenInfra Light Canvas",
    shortLabel: "Light (Clean)",
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
    requiresKey: false,
    badge: "OpenInfra Canvas",
    bgColor: "#F8FAFC",
    tiles: [],
    description: "Clean, muted light canvas matching OpenInfraMap. Power transmission corridors and substations stand out immediately with zero road clutter.",
  },
  {
    id: "esri-gray",
    label: "Esri Light Gray Canvas",
    shortLabel: "Esri Gray",
    attribution: 'Tiles © <a href="https://www.esri.com/" target="_blank">Esri</a>, HERE, Garmin, © OpenStreetMap contributors',
    requiresKey: false,
    badge: "Clean Canvas",
    bgColor: "#F8FAFC",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    description: "Minimalist light gray canvas. Gives maximum contrast for power transmission corridors and substation badges with zero road clutter.",
  },
  {
    id: "satellite",
    label: "Esri Satellite Imagery",
    shortLabel: "Satellite",
    attribution: 'Tiles © <a href="https://www.esri.com/" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
    requiresKey: false,
    badge: "Aerial",
    bgColor: "#0F172A",
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
    badge: "Topography",
    bgColor: "#F1F5F9",
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
    bgColor: "#F8FAFC",
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
  const [muteCivilInfra, setMuteCivilInfra] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'plants', 'substations', 'lines'
  const [searchQuery, setSearchQuery] = useState("");
  const [voltageFilter, setVoltageFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);

  // NASA POWER Weather & Temperature state
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);
  const [weatherLocationTarget, setWeatherLocationTarget] = useState(null);
  const [weatherCities, setWeatherCities] = useState([]);

  // Layer toggles (OpenInfra vector tiles superimposed on top of OSM by default)
  const [layersVisibility, setLayersVisibility] = useState({
    powerLines: true,
    powerPlants: true,
    substations: true,
    labels: false, // Clean OpenInfra-style vector rendering by default (zero badge clutter)
    liveOpenInfraTiles: true,
    cityWeather: false, // Weather badges toggleable on demand
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

  // Fetch live dataset, sync status, CRMS mappings, and Weather cities on mount
  useEffect(() => {
    const fetchRemoteData = async () => {
      try {
        const [dataRes, statusRes, crmsMapRes, crmsElemRes, citiesRes] = await Promise.allSettled([
          API.getPowerGridData(),
          API.getPowerGridStatus(),
          API.getCRMSMappings(),
          API.getCRMSCodebookElements("AC_TRANSMISSION_LINE_CIRCUIT"),
          API.getWeatherCities(),
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
        if (citiesRes.status === "fulfilled" && citiesRes.value?.cities) {
          setWeatherCities(citiesRes.value.cities);
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

    let failsafeTimer = null;

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          sources: {
            "er-boundaries": {
              type: "geojson",
              data: easternRegionBoundaries || "/geodata/eastern_region_boundaries.json",
            },
            "base-tiles": {
              type: "raster",
              tiles: initialTiles && initialTiles.length > 0 ? initialTiles : [
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution: activeProvider.attribution,
            },
            "wb-power-grid": {
              type: "geojson",
              data: gridData,
            },
            "openinfra-basemap": {
              type: "vector",
              tiles: ["https://openinframap.org/20250311/{z}/{x}/{y}.mvt"],
              maxzoom: 15,
              attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
            },
            openinframap: {
              type: "vector",
              tiles: ["https://openinframap.org/map/power/{z}/{x}/{y}.pbf"],
              maxzoom: 17,
              attribution:
                '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a> · <a href="https://openinframap.org/copyright" target="_blank">Open Infrastructure Map</a>',
            },
          },
          layers: [
            // 0. Base Canvas Background
            {
              id: "canvas-background",
              type: "background",
              paint: {
                "background-color": activeProvider.bgColor || "#F8FAFC",
              },
            },

            // 1. Base raster map (OSM, Light Gray, Satellite, Topo) - ALWAYS visible and never clamped
            {
              id: "base-tiles-layer",
              type: "raster",
              source: "base-tiles",
              minzoom: 0,
              maxzoom: 20,
              paint: {
                "raster-saturation": muteCivilInfra && activeBaseMap === "osm" ? -0.85 : 0,
                "raster-contrast": muteCivilInfra && activeBaseMap === "osm" ? -0.15 : 0,
                "raster-opacity": activeBaseMap === "carto-light" ? 0 : muteCivilInfra && activeBaseMap === "osm" ? 0.55 : 1.0,
              },
            },

            // Key-free OpenInfraMap vector canvas for the Light (Clean) option.
            {
              id: "openinfra-base-landuse",
              type: "fill",
              source: "openinfra-basemap",
              "source-layer": "landuse",
              layout: { visibility: activeBaseMap === "carto-light" ? "visible" : "none" },
              paint: { "fill-color": ["match", ["get", "kind"], "forest", "#E5ECE4", "wood", "#E5ECE4", "water", "#DCE8ED", "#F1F0EC"], "fill-opacity": 0.75 },
            },
            {
              id: "openinfra-base-water",
              type: "fill",
              source: "openinfra-basemap",
              "source-layer": "water",
              filter: ["==", ["geometry-type"], "Polygon"],
              layout: { visibility: activeBaseMap === "carto-light" ? "visible" : "none" },
              paint: { "fill-color": "#DCE8ED" },
            },
            {
              id: "openinfra-base-rivers",
              type: "line",
              source: "openinfra-basemap",
              "source-layer": "water",
              filter: ["==", ["geometry-type"], "LineString"],
              layout: { visibility: activeBaseMap === "carto-light" ? "visible" : "none" },
              paint: { "line-color": "#C9DCE4", "line-width": 1 },
            },
            {
              id: "openinfra-base-roads",
              type: "line",
              source: "openinfra-basemap",
              "source-layer": "roads",
              layout: { visibility: activeBaseMap === "carto-light" ? "visible" : "none" },
              paint: { "line-color": "#E2E1DD", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.3, 14, 1.5] },
            },

            // 2. Regional State Boundaries Outlines (Dashed boundary lines)
            {
              id: "er-state-outline",
              type: "line",
              source: "er-boundaries",
              filter: ["==", ["get", "category"], "state_boundary"],
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "#475569",
                "line-width": 1.5,
                "line-dasharray": [4, 2],
                "line-opacity": 0.55,
              },
            },

            // 3. State Name Labels
            {
              id: "er-state-label",
              type: "symbol",
              source: "er-boundaries",
              filter: ["==", ["get", "category"], "state_label"],
              layout: {
                "text-field": ["get", "name"],
                "text-size": 13,
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "text-letter-spacing": 0.12,
              },
              paint: {
                "text-color": "#1E293B",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 2.5,
                "text-opacity": 0.85,
              },
            },

            // 5. OpenInfra Vector Tiles Overlay — Bold saturated style matching openinframap.org
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
                "line-color": "#0F172A",
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 2.8,
                  8, 4.5,
                  12, 7.5,
                  16, 11.0,
                ],
                "line-opacity": 0.85,
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
                  // 765 kV / 800 kV UHV (Electric Cyan / Teal - OpenInfra standard)
                  [
                    "any",
                    [">=", ["to-number", ["get", "voltage"], 0], 700000],
                    [
                      "all",
                      [">=", ["to-number", ["get", "voltage"], 0], 650],
                      ["<", ["to-number", ["get", "voltage"], 0], 2000]
                    ]
                  ],
                  "#00B4D8",
                  // 400 kV EHV (OpenInfra Distinct Purple / Magenta)
                  [
                    "any",
                    [
                      "all",
                      [">=", ["to-number", ["get", "voltage"], 0], 350000],
                      ["<", ["to-number", ["get", "voltage"], 0], 650000]
                    ],
                    [
                      "all",
                      [">=", ["to-number", ["get", "voltage"], 0], 350],
                      ["<", ["to-number", ["get", "voltage"], 0], 650]
                    ]
                  ],
                  "#9333EA",
                  // 220 kV HV (OpenInfra Grid Red)
                  [
                    "any",
                    [
                      "all",
                      [">=", ["to-number", ["get", "voltage"], 0], 190000],
                      ["<", ["to-number", ["get", "voltage"], 0], 350000]
                    ],
                    [
                      "all",
                      [">=", ["to-number", ["get", "voltage"], 0], 190],
                      ["<", ["to-number", ["get", "voltage"], 0], 350]
                    ]
                  ],
                  "#DC2626",
                  // 132 kV / 66 kV (OpenInfra Orange / Amber)
                  [
                    "any",
                    [
                      "all",
                      [">=", ["to-number", ["get", "voltage"], 0], 50000],
                      ["<", ["to-number", ["get", "voltage"], 0], 190000]
                    ],
                    [
                      "all",
                      [">=", ["to-number", ["get", "voltage"], 0], 50],
                      ["<", ["to-number", ["get", "voltage"], 0], 190]
                    ]
                  ],
                  "#D97706",
                  // Muted Slate for lower distribution lines
                  "#64748B",
                ],
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 1.6,
                  8, 2.8,
                  12, 5.0,
                  16, 8.0,
                ],
                "line-opacity": 1.0,
              },
            },
            {
              id: "openinfra-line-label",
              type: "symbol",
              source: "openinframap",
              "source-layer": "power_line",
              minzoom: 9.0,
              layout: {
                visibility: "none",
                "symbol-placement": "line",
                "text-field": ["case", ["has", "name"], ["concat", ["get", "name"], " · ", ["to-string", ["get", "voltage"]], " kV"], ["has", "voltage"], ["concat", ["to-string", ["get", "voltage"]], " kV"], ""],
                "text-size": 11,
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "symbol-spacing": 250,
                "text-keep-upright": true,
              },
              paint: {
                "text-color": "#FFFFFF",
                "text-halo-color": "#0F172A",
                "text-halo-width": 3.0,
              },
            },

            // Tower and pole positions are mapped OSM features, available at detailed zoom.
            {
              id: "openinfra-towers",
              type: "circle",
              source: "openinframap",
              "source-layer": "power_tower",
              minzoom: 13,
              layout: { visibility: "none" },
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2, 17, 5],
                "circle-color": ["match", ["get", "type"], "pole", "#64748B", "#334155"],
                "circle-stroke-color": "#FFFFFF",
                "circle-stroke-width": 1,
              },
            },
            {
              id: "openinfra-tower-label",
              type: "symbol",
              source: "openinframap",
              "source-layer": "power_tower",
              minzoom: 15,
              filter: ["has", "ref"],
              layout: { visibility: "none", "text-field": ["get", "ref"], "text-size": 10, "text-offset": [0, 1.2], "text-anchor": "top" },
              paint: { "text-color": "#334155", "text-halo-color": "#FFFFFF", "text-halo-width": 2 },
            },

            // 5b. OpenInfra Substation Yard Boundary Polygons (Exact GIS Footprint)
            {
              id: "openinfra-substation-area",
              type: "fill",
              source: "openinframap",
              "source-layer": "power_substation",
              minzoom: 13.0,
              layout: {
                visibility: "none",
              },
              paint: {
                "fill-color": [
                  "case",
                  ["any",
                    [">=", ["to-number", ["get", "voltage"], 0], 700000],
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 650], ["<", ["to-number", ["get", "voltage"], 0], 2000]]
                  ],
                  "#00B4D8",
                  ["any",
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 350000], ["<", ["to-number", ["get", "voltage"], 0], 650000]],
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 350], ["<", ["to-number", ["get", "voltage"], 0], 650]]
                  ],
                  "#9333EA",
                  ["any",
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 190000], ["<", ["to-number", ["get", "voltage"], 0], 350000]],
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 190], ["<", ["to-number", ["get", "voltage"], 0], 350]]
                  ],
                  "#DC2626",
                  ["any",
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 50000], ["<", ["to-number", ["get", "voltage"], 0], 190000]],
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 50], ["<", ["to-number", ["get", "voltage"], 0], 190]]
                  ],
                  "#D97706",
                  "#7C3AED"
                ],
                "fill-opacity": 0.45,
                "fill-outline-color": "#0F172A",
              },
            },
            {
              id: "openinfra-substation-outline",
              type: "line",
              source: "openinframap",
              "source-layer": "power_substation",
              minzoom: 13.0,
              layout: {
                visibility: "none",
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "#0F172A",
                "line-width": 1.5,
                "line-opacity": 0.8,
              },
            },

            // 5c. OpenInfra Substation Centroid Node Markers (Exact GIS Position matching OpenInfraMap)
            {
              id: "openinfra-substation-point",
              type: "circle",
              source: "openinframap",
              "source-layer": "power_substation_point",
              minzoom: 6.0,
              layout: {
                visibility: "none",
              },
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6, 3.0,
                  9, 5.0,
                  12, 7.5,
                  15, 10.0
                ],
                "circle-color": [
                  "case",
                  ["any",
                    [">=", ["to-number", ["get", "voltage"], 0], 700000],
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 650], ["<", ["to-number", ["get", "voltage"], 0], 2000]]
                  ],
                  "#00B4D8",
                  ["any",
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 350000], ["<", ["to-number", ["get", "voltage"], 0], 650000]],
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 350], ["<", ["to-number", ["get", "voltage"], 0], 650]]
                  ],
                  "#9333EA",
                  ["any",
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 190000], ["<", ["to-number", ["get", "voltage"], 0], 350000]],
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 190], ["<", ["to-number", ["get", "voltage"], 0], 350]]
                  ],
                  "#DC2626",
                  ["any",
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 50000], ["<", ["to-number", ["get", "voltage"], 0], 190000]],
                    ["all", [">=", ["to-number", ["get", "voltage"], 0], 50], ["<", ["to-number", ["get", "voltage"], 0], 190]]
                  ],
                  "#D97706",
                  "#7C3AED"
                ],
                "circle-stroke-width": 2.0,
                "circle-stroke-color": "#FFFFFF",
                "circle-opacity": 0.95,
              },
            },

            // 5d. OpenInfra Substation Text Labels (Native MapLibre collision avoidance)
            {
              id: "openinfra-substation-label",
              type: "symbol",
              source: "openinframap",
              "source-layer": "power_substation_point",
              minzoom: 6.0,
              layout: {
                visibility: "none",
                "text-field": [
                  "case",
                  ["all", ["has", "name"], ["!=", ["get", "name"], ""]],
                  ["get", "name"],
                  ["all", ["has", "voltage"], ["!=", ["get", "voltage"], ""]],
                  ["concat", ["to-string", ["get", "voltage"]], " kV Substation"],
                  ""
                ],
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "text-size": 11,
                "text-offset": [0, 1.4],
                "text-anchor": "top",
                "text-optional": true,
                "text-max-width": 10,
              },
              paint: {
                "text-color": "#0F172A",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 2.5,
              },
            },

            // 5e. OpenInfra Power Generating Station Footprints
            {
              id: "openinfra-plant-area",
              type: "fill",
              source: "openinframap",
              "source-layer": "power_plant",
              minzoom: 8.5,
              layout: {
                visibility: "none",
              },
              paint: {
                "fill-color": "#F59E0B",
                "fill-opacity": 0.35,
                "fill-outline-color": "#B45309",
              },
            },
            {
              id: "openinfra-plant-label",
              type: "symbol",
              source: "openinframap",
              "source-layer": "power_plant",
              minzoom: 8.5,
              layout: {
                visibility: "none",
                "text-field": ["get", "name"],
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "text-size": 11,
                "text-offset": [0, 1.4],
                "text-anchor": "top",
                "text-optional": true,
              },
              paint: {
                "text-color": "#78350F",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 2.5,
              },
            },

            // 6. Curated ER Transmission Lines - High-Contrast Dark Slate Casing (Replaces washed-out white casing)
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
                "line-color": "#0F172A",
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  [
                    "match",
                    ["get", "voltage_class"],
                    800, 5.5,
                    765, 5.5,
                    400, 4.8,
                    220, 3.8,
                    3.0
                  ],
                  8,
                  [
                    "match",
                    ["get", "voltage_class"],
                    800, 8.5,
                    765, 8.5,
                    400, 7.2,
                    220, 5.8,
                    4.5
                  ],
                  12,
                  [
                    "match",
                    ["get", "voltage_class"],
                    800, 12.0,
                    765, 12.0,
                    400, 10.5,
                    220, 8.5,
                    7.0
                  ],
                  16,
                  [
                    "match",
                    ["get", "voltage_class"],
                    800, 17.0,
                    765, 17.0,
                    400, 15.0,
                    220, 12.0,
                    10.0
                  ]
                ],
                "line-opacity": 0.9,
              },
            },

            // 7. Curated ER Transmission Lines - Ultra-Prominent Saturated Core
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
                    "match",
                    ["get", "voltage_class"],
                    800, 3.2,
                    765, 3.2,
                    400, 2.6,
                    220, 2.0,
                    1.6
                  ],
                  8,
                  [
                    "match",
                    ["get", "voltage_class"],
                    800, 5.0,
                    765, 5.0,
                    400, 4.2,
                    220, 3.2,
                    2.5
                  ],
                  12,
                  [
                    "match",
                    ["get", "voltage_class"],
                    800, 7.5,
                    765, 7.5,
                    400, 6.2,
                    220, 5.0,
                    4.0
                  ],
                  16,
                  [
                    "match",
                    ["get", "voltage_class"],
                    800, 11.0,
                    765, 11.0,
                    400, 9.5,
                    220, 7.5,
                    6.0
                  ]
                ],
                "line-opacity": 1.0,
              },
            },

            // 7b. Double Circuit Parallel Track (Casing)
            {
              id: "wb-line-circuit2-casing",
              type: "line",
              source: "wb-power-grid",
              filter: ["all", ["==", ["get", "category"], "power_line"], ["==", ["get", "circuits"], 2]],
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "#0F172A",
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 4.8,
                  8, 7.2,
                  12, 10.5,
                  16, 15.0
                ],
                "line-offset": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6, -1.2,
                  10, -2.5,
                  14, -4.5,
                  17, -7.0
                ],
                "line-opacity": 0.9,
              },
            },

            // 7c. Double Circuit Parallel Track (Core)
            {
              id: "wb-line-circuit2-core",
              type: "line",
              source: "wb-power-grid",
              filter: ["all", ["==", ["get", "category"], "power_line"], ["==", ["get", "circuits"], 2]],
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
                  4, 2.6,
                  8, 4.2,
                  12, 6.2,
                  16, 9.5
                ],
                "line-offset": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6, -1.2,
                  10, -2.5,
                  14, -4.5,
                  17, -7.0
                ],
                "line-opacity": 1.0,
              },
            },

            // 8a. In-Line Operating Voltage Badges along transmission corridors
            {
              id: "wb-line-voltage-badge",
              type: "symbol",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_line"],
              minzoom: 8.0,
              layout: {
                "symbol-placement": "line",
                "text-field": [
                  "concat",
                  ["to-string", ["get", "voltage_class"]],
                  " kV",
                  ["case", ["==", ["get", "circuits"], 2], " (D/C)", ""]
                ],
                "text-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  8, 9.5,
                  12, 11.0,
                  16, 12.5
                ],
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "text-letter-spacing": 0.05,
                "symbol-spacing": 260,
                "text-keep-upright": true,
              },
              paint: {
                "text-color": "#FFFFFF",
                "text-halo-color": ["get", "color"],
                "text-halo-width": 3.5,
                "text-halo-blur": 0.5,
              },
            },

            // 8b. Full Transmission Corridor Names at deeper zooms
            {
              id: "wb-line-label",
              type: "symbol",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_line"],
              minzoom: 10.5,
              layout: {
                "symbol-placement": "line",
                "text-field": ["get", "name"],
                "text-size": 11,
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
                "text-letter-spacing": 0.04,
                "symbol-spacing": 350,
                "text-offset": [0, 1.2],
              },
              paint: {
                "text-color": "#0F172A",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 3.0,
              },
            },

            // 9. Substation outer glow halo — subtle, tight, OpenInfraMap-style
            {
              id: "wb-substation-beacon",
              type: "circle",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_substation"],
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 5.0,
                  7, 7.5,
                  10, 11.0,
                  14, 16.0,
                ],
                "circle-color": ["get", "color"],
                "circle-opacity": 0.22,
                "circle-stroke-width": 1.5,
                "circle-stroke-color": ["get", "color"],
                "circle-stroke-opacity": 0.6,
              },
            },

            // 10. Substation dot — compact, OpenInfraMap-style small square-ish node
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
                  4, 3.0,
                  7, 5.0,
                  10, 7.5,
                  14, 10.0,
                ],
                "circle-color": ["get", "color"],
                "circle-stroke-width": 2.0,
                "circle-stroke-color": "#FFFFFF",
              },
            },

            // 11. Substation Text Labels (Directly Demarcated on Map)
            {
              id: "wb-substation-label",
              type: "symbol",
              source: "wb-power-grid",
              filter: ["==", ["get", "category"], "power_substation"],
              minzoom: 7.5,
              layout: {
                "text-field": [
                  "concat",
                  ["get", "short_name"],
                  " (",
                  ["get", "voltage_class"],
                  "kV)"
                ],
                "text-size": 11,
                "text-offset": [0, 1.8],
                "text-anchor": "top",
                "text-justify": "center",
                "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
              },
              paint: {
                "text-color": "#0F172A",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 3.0,
              },
            },

            // 10. Power Plant Outer Glowing Beacon (Amber #F59E0B)
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
                  6, 11.0,
                  10, 17.0,
                  14, 25.0,
                ],
                "circle-color": "#F59E0B",
                "circle-opacity": 0.45,
                "circle-stroke-width": 2.5,
                "circle-stroke-color": "#F59E0B",
              },
            },

            // 11. Power Plant Core Circle (Amber #F59E0B)
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
                  6, 7.5,
                  10, 11.5,
                  14, 16.0,
                ],
                "circle-color": "#F59E0B",
                "circle-stroke-width": 3.0,
                "circle-stroke-color": "#FFFFFF",
              },
            },

            // 12. Power Plant Labels (Always visible with short name & MW capacity)
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
                "text-color": "#78350F",
                "text-halo-color": "#FFFFFF",
                "text-halo-width": 3.0,
              },
            },
          ],
        },
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 3,
        maxZoom: 18,
      });

      map.addControl(new NavigationControl({ showCompass: true }), "top-right");

      // Keep mapped OSM geometry and names above the approximate curated grid data.
      map.on("load", () => {
        [
          "openinfra-line-casing", "openinfra-line-core", "openinfra-plant-area",
          "openinfra-substation-area", "openinfra-substation-outline",
          "openinfra-substation-point", "openinfra-towers", "openinfra-line-label",
          "openinfra-plant-label", "openinfra-substation-label", "openinfra-tower-label",
        ].forEach((id) => {
          if (map.getLayer(id)) map.moveLayer(id);
        });
      });

      // Multi-stage map load trigger to guarantee markers & layers load immediately
      let hasLoaded = false;
      const markLoaded = () => {
        if (!hasLoaded) {
          hasLoaded = true;
          setMapLoaded(true);
        }
      };

      map.on("load", markLoaded);
      map.once("style.load", markLoaded);
      map.once("idle", markLoaded);

      // Failsafe timer: guarantees mapLoaded = true within 800ms even if external tile servers are slow/unreachable
      failsafeTimer = setTimeout(() => {
        markLoaded();
      }, 800);

      // Click on Power Transmission Lines (Master Corridors & Circuit 2 & OpenInfra Lines)
      const handleLineClick = (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = feat.properties || {};

        new Popup({ offset: 12, className: "power-popup" })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: inherit; font-size: 13px; line-height: 1.45; padding: 4px; min-width: 230px;">
              <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: #0F172A; margin-bottom: 6px;">
                <span style="display: inline-block; width: 13px; height: 13px; border-radius: 3px; background: ${props.color || '#EF4444'};"></span>
                <span>⚡ ${props.name || 'Transmission Corridor'}</span>
              </div>
              <div style="font-size: 11.5px; color: #475569; display: flex; flex-direction: column; gap: 3px;">
                <div><b>Operating Voltage:</b> <span style="color:${props.color || '#DC2626'}; font-weight:800; font-size:12.5px;">${props.voltage_label || (props.voltage_class ? props.voltage_class + ' kV' : '400 kV')}</span></div>
                <div><b>Corridor Circuits:</b> ${props.circuits === 2 ? 'Double Circuit (D/C) Twin Track' : 'Single Circuit (S/C)'}</div>
                <div><b>Utility / Operator:</b> ${props.operator || 'POWERGRID / WBSETCL'}</div>
                <div><b>Type:</b> ${props.line_type || 'Overhead Transmission Corridor'}</div>
                ${props.length_km ? `<div><b>Corridor Length:</b> ${props.length_km} km</div>` : ''}
              </div>
            </div>
          `)
          .addTo(map);
      };

      map.on("click", "wb-line-core", handleLineClick);
      map.on("click", "wb-line-circuit2-core", handleLineClick);

      // Click on OpenInfra Live Substations (Exact GIS features)
      const handleOpenInfraSubClick = (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = feat.properties || {};
        const rawV = parseFloat(props.voltage) || 0;
        const vDisplay = rawV >= 1000 ? Math.round(rawV / 1000) + " kV" : (rawV > 0 ? rawV + " kV" : "Transmission Substation");
        const subName = props.name || `${vDisplay} Substation`;

        new Popup({ offset: 12, className: "power-popup" })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: inherit; font-size: 13px; line-height: 1.45; padding: 4px; min-width: 230px;">
              <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: #0F172A; margin-bottom: 6px;">
                <span style="display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: #7C3AED; border: 1.5px solid #FFFFFF;"></span>
                <span>⚡ ${subName}</span>
              </div>
              <div style="font-size: 11.5px; color: #475569; display: flex; flex-direction: column; gap: 3px;">
                <div><b>Operating Voltage:</b> <span style="color:#7C3AED; font-weight:800;">${vDisplay}</span></div>
                <div><b>Substation Type:</b> ${props.substation || 'Transmission Grid Substation'}</div>
                <div><b>Exact Coordinates:</b> ${e.lngLat.lat.toFixed(5)}° N, ${e.lngLat.lng.toFixed(5)}° E</div>
                <div><b>Source:</b> OpenStreetMap / OpenInfraMap (MVT)</div>
              </div>
            </div>
          `)
          .addTo(map);
      };

      map.on("click", "openinfra-substation-point", handleOpenInfraSubClick);
      map.on("click", "openinfra-substation-area", handleOpenInfraSubClick);

      map.on("click", "openinfra-towers", (e) => {
        const props = e.features?.[0]?.properties || {};
        const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
        new Popup({ offset: 10, className: "power-popup" })
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-size:13px;line-height:1.5;padding:4px"><b>${escape(props.type === "pole" ? "Power pole" : "Transmission tower")}</b>${props.ref ? `<div><b>Reference:</b> ${escape(props.ref)}</div>` : ""}${props.name ? `<div><b>Name:</b> ${escape(props.name)}</div>` : ""}<div><b>Mapped position:</b> ${e.lngLat.lat.toFixed(5)}° N, ${e.lngLat.lng.toFixed(5)}° E</div><div><b>Source:</b> OpenStreetMap / OpenInfraMap</div></div>`)
          .addTo(map);
      });

      // Click on Live OpenInfra Vector Lines
      map.on("click", "openinfra-line-core", (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = feat.properties || {};
        const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
        const rawV = parseFloat(props.voltage) || 0;
        const vDisplay = rawV >= 1000 ? Math.round(rawV / 1000) + " kV" : (rawV > 0 ? rawV + " kV" : "Transmission Line");

        new Popup({ offset: 12, className: "power-popup" })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: inherit; font-size: 13px; line-height: 1.45; padding: 4px; min-width: 220px;">
              <div style="display: flex; align-items: center; gap: 6px; font-weight: 800; color: #0F172A; margin-bottom: 6px;">
                <span style="font-size: 14px;">🌐</span>
                <span>${escape(props.name || props.ref || "OpenInfra Transmission Line")}</span>
              </div>
              <div style="font-size: 11.5px; color: #475569; display: flex; flex-direction: column; gap: 3px;">
                <div><b>Operating Voltage:</b> <span style="color:#DC2626; font-weight:800;">${vDisplay}</span></div>
                <div><b>Circuits:</b> ${escape(props.circuits || "Unspecified")}</div>
                <div><b>Line type:</b> ${escape(props.line || "Power line")}</div>
                <div><b>Operator / Grid:</b> ${escape(props.operator || "Unspecified")}</div>
                ${props.ref ? `<div><b>Reference:</b> ${escape(props.ref)}</div>` : ""}
                <div><b>Source:</b> OpenInfrastructureMap (MVT)</div>
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
      const handleSubstationClick = (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = feat.properties || {};

        setSelectedEntity({
          type: "substation",
          ...props,
          coords: feat.geometry.coordinates,
        });
      };
      map.on("click", "wb-substation-circle", handleSubstationClick);
      map.on("click", "wb-substation-beacon", handleSubstationClick);

      // Pointer cursor hover
      const clickable = ["wb-line-core", "wb-line-circuit2-core", "openinfra-line-core", "openinfra-towers", "openinfra-substation-point", "openinfra-substation-area", "openinfra-plant-area", "wb-plant-core", "wb-plant-beacon", "wb-substation-circle", "wb-substation-beacon"];
      clickable.forEach((l) => {
        map.on("mouseenter", l, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", l, () => {
          map.getCanvas().style.cursor = "";
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
      if (failsafeTimer) clearTimeout(failsafeTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update base map layer when changed or when API key or muting toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const baseConfig = BASEMAP_PROVIDERS.find((b) => b.id === activeBaseMap) || BASEMAP_PROVIDERS[0];
    const tiles = baseConfig.getTiles ? baseConfig.getTiles(cartoApiKey) : baseConfig.tiles;

    // 1. Update background canvas color
    if (map.getLayer("canvas-background")) {
      map.setPaintProperty("canvas-background", "background-color", baseConfig.bgColor || "#F8FAFC");
    }
    const cleanCanvas = activeBaseMap === "carto-light";
    ["openinfra-base-landuse", "openinfra-base-water", "openinfra-base-rivers", "openinfra-base-roads"].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", cleanCanvas ? "visible" : "none");
    });
    if (map.getLayer("base-tiles-layer")) {
      map.setLayoutProperty("base-tiles-layer", "visibility", cleanCanvas ? "none" : "visible");
    }

    // 2. Robust remove-layer -> remove-source -> re-add-source -> re-add-layer pattern
    // (Bypasses src.setTiles which is unsupported in older MapLibre GL versions)
    if (tiles && tiles.length > 0) {
      try {
        // Step A: Remove existing raster layer first (required by MapLibre before removing source)
        if (map.getLayer("base-tiles-layer")) {
          map.removeLayer("base-tiles-layer");
        }

        // Step B: Remove existing source
        if (map.getSource("base-tiles")) {
          map.removeSource("base-tiles");
        }

        // Step C: Re-add source with new tile URLs
        map.addSource("base-tiles", {
          type: "raster",
          tiles: tiles,
          tileSize: 256,
          attribution: baseConfig.attribution,
        });

        // Step D: Re-add layer positioned before data layers so it stays firmly in the background
        const beforeId = map.getLayer("er-state-outline")
          ? "er-state-outline"
          : map.getLayer("openinfra-line-casing")
          ? "openinfra-line-casing"
          : map.getLayer("wb-line-casing")
          ? "wb-line-casing"
          : undefined;

        const isOsm = baseConfig.id === "osm";
        map.addLayer(
          {
            id: "base-tiles-layer",
            type: "raster",
            source: "base-tiles",
            minzoom: 0,
            maxzoom: 20,
            paint: {
              "raster-saturation": isOsm && muteCivilInfra ? -0.7 : 0,
              "raster-contrast": isOsm && muteCivilInfra ? -0.1 : 0,
              "raster-opacity": isOsm && muteCivilInfra ? 0.75 : 1.0,
            },
          },
          beforeId
        );
      } catch (err) {
        console.warn("Base map layer switch error:", err);
      }
    }
  }, [activeBaseMap, cartoApiKey, muteCivilInfra, mapLoaded]);

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
    setVis("wb-line-circuit2-casing", layersVisibility.powerLines);
    setVis("wb-line-circuit2-core", layersVisibility.powerLines);
    setVis("wb-line-voltage-badge", layersVisibility.powerLines && layersVisibility.labels);
    setVis("wb-line-label", layersVisibility.powerLines && layersVisibility.labels);
    setVis("wb-plant-beacon", layersVisibility.powerPlants);
    setVis("wb-plant-core", layersVisibility.powerPlants);
    setVis("wb-plant-label", layersVisibility.powerPlants && layersVisibility.labels);
    setVis("wb-substation-beacon", layersVisibility.substations && !layersVisibility.liveOpenInfraTiles);
    setVis("wb-substation-circle", layersVisibility.substations && !layersVisibility.liveOpenInfraTiles);
    setVis("wb-substation-label", layersVisibility.substations && layersVisibility.labels && !layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-line-casing", layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-line-core", layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-line-label", layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-towers", layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-tower-label", layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-substation-area", layersVisibility.substations && layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-substation-outline", layersVisibility.substations && layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-substation-point", layersVisibility.substations && layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-substation-label", layersVisibility.substations && layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-plant-area", layersVisibility.powerPlants && layersVisibility.liveOpenInfraTiles);
    setVis("openinfra-plant-label", layersVisibility.powerPlants && layersVisibility.liveOpenInfraTiles);
  }, [layersVisibility, mapLoaded]);

  // Render HTML Markers for Substations & Plants
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!layersVisibility.labels) return;

    // Render badges for Substations
    // Using anchor='bottom' so the callout arrow tip points exactly at the coordinate
    if (layersVisibility.substations && !layersVisibility.liveOpenInfraTiles) {
      allSubstations.forEach((sub) => {
        const el = document.createElement("div");
        el.className = "wb-substation-badge";
        // No manual transform — MapLibre Marker with anchor:'bottom' handles positioning
        el.style.cssText = `
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: auto;
        `;

        const badgeColor =
          sub.voltage_class >= 765
            ? "#CA8A04"
            : sub.voltage_class >= 400
            ? "#DC2626"
            : sub.voltage_class >= 220
            ? "#16A34A"
            : "#0284C7";

        el.innerHTML = `
          <div style="
            background: ${badgeColor};
            color: #FFFFFF;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 7px;
            border-radius: 999px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            white-space: nowrap;
            border: 1.5px solid #FFFFFF;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span>⚡ ${sub.short_name || sub.name}</span>
            <span style="background: rgba(0,0,0,0.25); padding: 1px 4px; border-radius: 3px; font-size: 8.5px; font-weight: 700;">${sub.voltage_class}kV</span>
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

        const coords = getEntityCoordinates(sub);
        // anchor:'bottom' means the bottom-centre of the element sits exactly at the coordinate
        const marker = new Marker({ element: el, anchor: "bottom" })
          .setLngLat([coords.lon, coords.lat])
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

    // Render badges for Power Generating Stations (Amber #F59E0B)
    if (layersVisibility.powerPlants) {
      allPlants.forEach((plant) => {
        const el = document.createElement("div");
        el.className = "wb-plant-badge";
        // anchor:'bottom' on the Marker — no manual CSS transform needed
        el.style.cssText = `
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: auto;
        `;

        el.innerHTML = `
          <div style="
            background: #F59E0B;
            color: #78350F;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 7px;
            border-radius: 999px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            white-space: nowrap;
            border: 1.5px solid #FFFFFF;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span>🏭 ${plant.short_name || plant.name}</span>
            <span style="background: rgba(120,53,15,0.2); padding: 1px 4px; border-radius: 3px; font-size: 8.5px; font-weight: 700;">${plant.capacity_label || plant.capacity_mw + ' MW'}</span>
          </div>
          <div style="
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 5px solid #F59E0B;
            margin-top: -1px;
          "></div>
        `;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          flyToEntity("plant", plant);
        });

        const pcoords = getEntityCoordinates(plant);
        const marker = new Marker({ element: el, anchor: "bottom" })
          .setLngLat([pcoords.lon, pcoords.lat])
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

    // Render Weather / Temperature badges for Key Cities
    if (layersVisibility.cityWeather && weatherCities && weatherCities.length > 0) {
      weatherCities.slice(0, 15).forEach((city) => {
        const el = document.createElement("div");
        el.className = "er-city-weather-badge";
        el.style.cssText = `
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-50%, -100%);
          pointer-events: auto;
        `;
        el.innerHTML = `
          <div style="
            background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
            color: #FFFFFF;
            font-size: 9.5px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 999px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            white-space: nowrap;
            border: 1.5px solid #F59E0B;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span>🌦️ ${city.name}</span>
            <span style="background: rgba(245,158,11,0.3); color: #FDE68A; padding: 1px 3px; border-radius: 3px; font-size: 8px; font-weight: 800;">NASA Temp</span>
          </div>
          <div style="
            width: 0;
            height: 0;
            border-left: 3px solid transparent;
            border-right: 3px solid transparent;
            border-top: 4px solid #0F172A;
            margin-top: -1px;
          "></div>
        `;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setWeatherLocationTarget({
            name: city.name,
            latitude: city.latitude,
            longitude: city.longitude,
            district: city.district,
            state: city.state,
          });
          setWeatherModalOpen(true);
        });

        const marker = new Marker({ element: el })
          .setLngLat([city.longitude, city.latitude])
          .addTo(map);

        markersRef.current.push(marker);
      });
    }
  }, [mapLoaded, layersVisibility.labels, layersVisibility.substations, layersVisibility.powerPlants, layersVisibility.cityWeather, allSubstations, allPlants, weatherCities]);

  // Fly to Entity (Substation, Power Plant, or Line)
  const flyToEntity = (type, entity) => {
    setSelectedEntity({ type, ...entity });
    const map = mapRef.current;
    if (!map) return;

    const coords = getEntityCoordinates(entity);
    if (type === "line") {
      map.flyTo({
        center: [coords.lon, coords.lat],
        zoom: 10.5,
        speed: 1.2,
      });
    } else {
      map.flyTo({
        center: [coords.lon, coords.lat],
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

  const selectedCoords = selectedEntity ? getEntityCoordinates(selectedEntity) : null;

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

            {/* NASA Weather & Temperature Button */}
            <button
              onClick={() => {
                setWeatherLocationTarget(null);
                setWeatherModalOpen(true);
              }}
              className="btn btn-sm d-flex align-items-center gap-1.5 fw-bold shadow-sm text-dark border-0"
              style={{
                background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                color: "#FFFFFF",
              }}
              title="NASA POWER Daily Meteorology & Temperature Analysis"
            >
              <CloudSun size={14} className="text-white" />
              <span className="text-white">Weather / Temp (NASA)</span>
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

                  {/* Filter Pills with Standard Voltage Colors */}
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {["all", "765", "400", "220", "132"].map((vf) => {
                      const chipColor =
                        vf === "765"
                          ? "#CA8A04"
                          : vf === "400"
                          ? "#DC2626"
                          : vf === "220"
                          ? "#16A34A"
                          : vf === "132"
                          ? "#0284C7"
                          : "#1E293B";
                      const isActive = voltageFilter === vf;
                      return (
                        <button
                          key={vf}
                          className="btn btn-xs px-2 py-0.5 rounded-pill fw-bold transition-all"
                          style={{
                            fontSize: "11px",
                            backgroundColor: isActive ? chipColor : "transparent",
                            color: isActive ? "#FFFFFF" : chipColor,
                            border: `1.5px solid ${chipColor}`,
                          }}
                          onClick={() => setVoltageFilter(vf)}
                        >
                          {vf === "all" ? "All kV" : `${vf} kV`}
                        </button>
                      );
                    })}
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
                  {/* Power Plants Section (Amber #F59E0B) */}
                  {(activeTab === "all" || activeTab === "plants") && filteredPlants.length > 0 && (
                    <div className="mb-3">
                      <div className="d-flex align-items-center justify-content-between px-1 mb-1 fw-bold small" style={{ color: "#B45309" }}>
                        <span className="d-flex align-items-center gap-1">
                          <Flame size={14} style={{ color: "#F59E0B" }} /> Power Generating Stations
                        </span>
                        <span className="badge rounded-pill fw-bold" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>
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
                                  ? "shadow-sm"
                                  : "bg-white hover-bg-light cursor-pointer"
                              }`}
                              style={{
                                cursor: "pointer",
                                backgroundColor: isSelected ? "#FEF3C7" : undefined,
                                borderColor: isSelected ? "#F59E0B" : undefined,
                                borderLeft: `4px solid #F59E0B`,
                              }}
                            >
                              <div className="d-flex align-items-center justify-content-between">
                                <span className="fw-bold text-dark small d-flex align-items-center gap-1.5">
                                  <span>{plant.fuel === "coal" ? "🔥" : "💧"}</span>
                                  <span>{plant.short_name || plant.name}</span>
                                </span>
                                <span className="badge border fw-bold" style={{ fontSize: "10px", backgroundColor: "#FEF3C7", color: "#92400E", borderColor: "#FDE68A" }}>
                                  {plant.capacity_label || `${plant.capacity_mw} MW`}
                                </span>
                              </div>
                              <div className="d-flex align-items-center justify-content-between text-muted mt-1" style={{ fontSize: "11px" }}>
                                <span>{plant.operator} · {plant.district}</span>
                                <span className="fw-bold" style={{ color: "#B45309" }}>{plant.voltage || '400 kV'}</span>
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
                              ? "#CA8A04"
                              : sub.voltage_class >= 400
                              ? "#DC2626"
                              : sub.voltage_class >= 220
                              ? "#16A34A"
                              : "#0284C7";

                          return (
                            <div
                              key={sub.id}
                              onClick={() => flyToEntity("substation", sub)}
                              className={`p-2 rounded-2 border transition-all ${
                                isSelected
                                  ? "bg-light border-primary shadow-sm"
                                  : "bg-white hover-bg-light cursor-pointer"
                              }`}
                              style={{
                                cursor: "pointer",
                                borderLeft: `4px solid ${vColor}`,
                              }}
                            >
                              <div className="d-flex align-items-center justify-content-between">
                                <span className="fw-bold text-dark small d-flex align-items-center gap-1.5">
                                  <span
                                    style={{
                                      width: "9px",
                                      height: "9px",
                                      borderRadius: "50%",
                                      backgroundColor: vColor,
                                      display: "inline-block",
                                    }}
                                  ></span>
                                  <span>{sub.short_name || sub.name}</span>
                                </span>
                                <span
                                  className="badge rounded-pill fw-bold"
                                  style={{
                                    backgroundColor: `${vColor}18`,
                                    color: vColor,
                                    border: `1.5px solid ${vColor}50`,
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
              style={{ backgroundColor: "#F8FAFC" }}
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
                    GRID LAYERS & INFRASTRUCTURE
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
                      <span className="fw-bold text-dark">⚡ Transmission Corridors (ER)</span>
                    </label>

                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none">
                      <input
                        type="checkbox"
                        checked={layersVisibility.powerPlants}
                        onChange={(e) =>
                          setLayersVisibility({ ...layersVisibility, powerPlants: e.target.checked })
                        }
                      />
                      <span className="fw-bold" style={{ color: "#B45309" }}>🏭 Power Generating Stations (Amber)</span>
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

                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none">
                      <input
                        type="checkbox"
                        checked={layersVisibility.cityWeather}
                        onChange={(e) =>
                          setLayersVisibility({
                            ...layersVisibility,
                            cityWeather: e.target.checked,
                          })
                        }
                      />
                      <span className="fw-bold" style={{ color: "#D97706" }}>🌦️ City Weather Badges (NASA)</span>
                    </label>

                    {/* De-emphasize Civil Infrastructure Switch */}
                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none mt-1 pt-1 border-top bg-light p-1 rounded">
                      <input
                        type="checkbox"
                        checked={muteCivilInfra}
                        onChange={(e) => setMuteCivilInfra(e.target.checked)}
                      />
                      <span className="fw-bold text-dark" style={{ fontSize: "10.5px" }}>
                        🛡 De-emphasize Roads & Civil Infra
                      </span>
                    </label>

                    <label className="d-flex align-items-center gap-1.5 cursor-pointer user-select-none pt-0.5">
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

                  {/* NASA Weather & Temp Info Box */}
                  {selectedCoords && (
                    <div className="mb-2 p-2 rounded" style={{ backgroundColor: "#FEF3C7", border: "1px solid #FCD34D" }}>
                      <div className="d-flex align-items-center justify-content-between">
                        <span className="small fw-bold text-dark d-flex align-items-center gap-1">
                          <CloudSun size={13} className="text-warning-emphasis" /> NASA Weather & Temp:
                        </span>
                        <button
                          onClick={() => {
                            setWeatherLocationTarget({
                              name: selectedEntity.name,
                              latitude: selectedCoords.lat,
                              longitude: selectedCoords.lon,
                              district: selectedEntity.district,
                              state: selectedEntity.state,
                            });
                            setWeatherModalOpen(true);
                          }}
                          className="btn btn-link btn-xs p-0 text-decoration-none fw-bold text-dark"
                          style={{ fontSize: "10.5px" }}
                        >
                          View NASA Trends ➔
                        </button>
                      </div>
                      <div className="d-flex align-items-center justify-content-between mt-1 text-dark" style={{ fontSize: "11px" }}>
                        <span>
                          Lat: {selectedCoords.lat.toFixed(3)}°N, Lon: {selectedCoords.lon.toFixed(3)}°E
                        </span>
                        <span className="badge bg-warning text-dark font-monospace" style={{ fontSize: "9px" }}>
                          T2M • Daily
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="d-flex align-items-center gap-1.5 pt-2 border-top">
                    {selectedCoords && (
                      <button
                        onClick={() => {
                          setWeatherLocationTarget({
                            name: selectedEntity.name,
                            latitude: selectedCoords.lat,
                            longitude: selectedCoords.lon,
                            district: selectedEntity.district,
                            state: selectedEntity.state,
                          });
                          setWeatherModalOpen(true);
                        }}
                        className="btn btn-warning btn-xs py-1 px-2 d-flex align-items-center gap-1 fw-bold text-dark shadow-xs"
                        style={{ fontSize: "11px" }}
                      >
                        <CloudSun size={12} />
                        NASA Weather
                      </button>
                    )}
                    {selectedCoords && (
                      <a
                        href={`https://openinframap.org/#14/${selectedCoords.lat.toFixed(4)}/${selectedCoords.lon.toFixed(4)}`}
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

            {/* Voltage Legend Overlay (Standard Grid Colors) */}
            <div
              className="position-absolute bottom-0 end-0 m-3 card border-0 shadow rounded-3 p-2.5 bg-white bg-opacity-95 backdrop-blur z-2"
              style={{ fontSize: "11px", minWidth: "215px" }}
            >
              <div className="fw-bold text-dark mb-1.5 d-flex align-items-center justify-content-between gap-3 border-bottom pb-1">
                <span>Voltage Legend (kV)</span>
                <span className="badge bg-dark text-white" style={{ fontSize: "9px" }}>
                  Standard Grid
                </span>
              </div>
              <div className="d-flex flex-column gap-1.5">
                <div className="d-flex align-items-center gap-2">
                  <span style={{ width: "18px", height: "5px", backgroundColor: "#CA8A04", borderRadius: "2px", border: "1px solid #0F172A", display: "inline-block" }}></span>
                  <span className="fw-bold" style={{ color: "#CA8A04" }}>765 kV</span>
                  <span className="text-muted small ms-auto">Dark Yellow</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span style={{ width: "18px", height: "5px", backgroundColor: "#DC2626", borderRadius: "2px", border: "1px solid #0F172A", display: "inline-block" }}></span>
                  <span className="fw-bold" style={{ color: "#DC2626" }}>400 kV</span>
                  <span className="text-muted small ms-auto">Red (Main Grid)</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span style={{ width: "18px", height: "5px", backgroundColor: "#16A34A", borderRadius: "2px", border: "1px solid #0F172A", display: "inline-block" }}></span>
                  <span className="fw-bold" style={{ color: "#16A34A" }}>220 kV</span>
                  <span className="text-muted small ms-auto">Green</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span style={{ width: "18px", height: "5px", backgroundColor: "#0284C7", borderRadius: "2px", border: "1px solid #0F172A", display: "inline-block" }}></span>
                  <span className="fw-bold" style={{ color: "#0284C7" }}>132 kV</span>
                  <span className="text-muted small ms-auto">Blue</span>
                </div>
                <div className="d-flex align-items-center gap-2 pt-1.5 mt-0.5 border-top">
                  <span style={{ width: "12px", height: "12px", backgroundColor: "#F59E0B", borderRadius: "50%", border: "2px solid #FFF", boxShadow: "0 0 0 1.5px #B45309", display: "inline-block" }}></span>
                  <span className="fw-bold" style={{ color: "#B45309" }}>🏭 Power Plants / Gen</span>
                  <span className="badge rounded-pill ms-auto" style={{ backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "9px" }}>
                    Amber (#F59E0B)
                  </span>
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
      {/* NASA POWER Weather & Temperature Modal */}
      <NasaWeatherModal
        isOpen={weatherModalOpen}
        onClose={() => setWeatherModalOpen(false)}
        initialLocation={weatherLocationTarget}
      />
    </div>
  );
}
